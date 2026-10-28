import {
  OPERATOR_CATEGORIES,
  type CatalogFragment,
  type CatalogOperator,
  type CatalogOperatorParameter,
  type CategoryListing,
  type CategoryOverrides,
  type ColorPair,
  type FragmentInfo,
  type Listing,
  type ListingMap,
  type OperatorCategory,
  type OperatorInfo,
} from 'fig-tree-evaluator'
import {
  categoryListings as coreCategoryListings,
  getCatalog,
  operatorListings as coreOperatorListings,
} from 'fig-tree-evaluator/catalog'
import { strings } from './strings'

// How operators, categories and fragments are shown: names, text, links,
// colours, the seeds the starting-value rule reads, and what a null does at
// each parameter.
//
// Operators, `literal` and fragments come from `./catalog`'s `getCatalog`,
// which merges listings field by field, `seeds` and `parameterDescriptions`
// per parameter, lowest first: an entry's own (the package's for a core
// operator and `literal`, a fragment definition's `listing`), then the
// editor's (`literal`'s description, and a host operator's colours), then
// the host's `operatorListings` prop, which reaches fragments too.
// Categories take the host's `categoryListings` prop over the package's,
// field by field. A display name is only one a listing gives, so an entry
// with none shows only its name, on the header's button: the pickers fall
// back to the name itself, and a fragment's header says "Fragment".

export type OperatorListingsProp = ListingMap
export type CategoryListingsProp = CategoryOverrides

export interface OperatorDisplay {
  displayName?: string
  description?: string
  parameterDescriptions: Record<string, string>
  docUrl?: string
  colors: ColorPair
  seeds: Record<string, unknown> // every declared parameter's starting value
  nullOutcomes: Record<string, NullOutcomes> // every declared parameter's
}

// What a null does at a parameter, and at one of its elements, as the
// engine resolves it
export type NullOutcomes = Pick<CatalogOperatorParameter, 'nullOutcome' | 'elementNullOutcome'>

export interface CategoryDisplay extends CategoryListing {
  category: OperatorCategory
}

export type FragmentDisplay = Omit<OperatorDisplay, 'nullOutcomes'>

export interface DisplayData {
  operators: Record<string, OperatorDisplay> // by canonical name, `literal` included
  categories: CategoryDisplay[] // in `order`
  fragments: Record<string, FragmentDisplay>
}

interface Registry {
  operators: OperatorInfo[]
  fragments: FragmentInfo[]
  operatorListings?: OperatorListingsProp
  categoryListings?: CategoryListingsProp
}

export const buildDisplayData = ({
  operators,
  fragments,
  operatorListings = {},
  categoryListings = {},
}: Registry): DisplayData => {
  const categories = OPERATOR_CATEGORIES.map((category) => ({
    category,
    ...coreCategoryListings[category],
    ...defined(categoryListings[category]),
  })).sort((a, b) => a.order - b.order)
  const categoryColour = (category: OperatorCategory) =>
    categories.find((entry) => entry.category === category)!.colors.background

  // `./catalog` gives `literal` no description. An operator it has no
  // listing for takes shades of its category's colour, as the host's
  // categories have it, under any colours of its own.
  const editorListings: ListingMap = {
    literal: { description: strings.FT_LITERAL_DESCRIPTION },
  }
  for (const { name, category } of operators)
    if (own(coreOperatorListings, name) === undefined)
      editorListings[name] = {
        colors: {
          background: lightShade(categoryColour(category)),
          text: darkShade(categoryColour(category)),
        },
      }

  const catalog = getCatalog(
    { getOperators: () => operators, getFragments: () => fragments },
    { listings: [editorListings, operatorListings] }
  )

  // `getCatalog` falls back to the name where no listing has a display name
  const hasDisplayName = (name: string, base: Listing | undefined) =>
    [base, own(operatorListings, name)].some((listing) => typeof listing?.displayName === 'string')
  const fragmentListings = new Map(fragments.map(({ name, listing }) => [name, listing]))

  const { literal } = catalog
  return {
    operators: {
      ...Object.fromEntries(
        catalog.operators.map((operator) => [
          operator.name,
          {
            ...entryDisplay(
              operator,
              hasDisplayName(operator.name, own(coreOperatorListings, operator.name))
            ),
            nullOutcomes: nullOutcomesOf(operator),
          },
        ])
      ),
      // `literal` is grammar, not an operator, so it has a catalog entry of
      // its own, and its content is plain data
      literal: {
        ...entryDisplay(literal, true),
        nullOutcomes: { value: { nullOutcome: 'value' } },
      },
    },
    categories,
    fragments: Object.fromEntries(
      catalog.fragments.map((fragment) => [
        fragment.name,
        entryDisplay(fragment, hasDisplayName(fragment.name, fragmentListings.get(fragment.name))),
      ])
    ),
  }
}

type CatalogEntry = Pick<
  CatalogOperator | CatalogFragment,
  'displayName' | 'description' | 'docUrl' | 'colors'
> & {
  parameters: Record<string, { description?: string; seed: unknown }>
}

const entryDisplay = (
  { displayName, description, docUrl, colors, parameters }: CatalogEntry,
  hasDisplayName: boolean
): FragmentDisplay => {
  const entries = Object.entries(parameters)
  return {
    ...(hasDisplayName && { displayName }),
    description,
    parameterDescriptions: Object.fromEntries(
      entries.flatMap(([key, { description }]) =>
        description === undefined ? [] : [[key, description]]
      )
    ),
    docUrl,
    colors,
    seeds: Object.fromEntries(entries.map(([key, { seed }]) => [key, seed])),
  }
}

const nullOutcomesOf = ({ parameters }: CatalogOperator) =>
  Object.fromEntries(
    Object.entries(parameters).map(([key, { nullOutcome, elementNullOutcome }]) => [
      key,
      { nullOutcome, ...(elementNullOutcome !== undefined && { elementNullOutcome }) },
    ])
  )

// A host operator with no colours of its own takes a light shade of its
// category's colour, so it sits with its category's siblings. Derived in CSS,
// so a category colour can be any CSS colour.
export const lightShade = (colour: string) => `color-mix(in srgb, ${colour} 18%, white)`
export const darkShade = (colour: string) => `color-mix(in srgb, ${colour}, black 65%)`

// A fragment's listing as its definition gives it, where `getCatalog` hasn't
// read it: registration never looks inside a listing, so only fields of the
// right type are read, and the colours only as a pair
export const readListing = (listing: unknown) => {
  const read: Pick<Listing, 'displayName' | 'description' | 'docUrl' | 'colors'> = {}
  if (!isRecord(listing)) return read
  for (const field of ['displayName', 'description', 'docUrl'] as const) {
    const value = listing[field]
    if (typeof value === 'string') read[field] = value
  }
  const { colors } = listing
  if (isRecord(colors) && typeof colors.background === 'string' && typeof colors.text === 'string')
    read.colors = { background: colors.background, text: colors.text }
  return read
}

// The entry a map holds itself, not one it inherits
const own = (map: ListingMap, name: string): Listing | undefined =>
  Object.prototype.hasOwnProperty.call(map, name) ? map[name] : undefined

// Without the fields a host set to `undefined`, which would otherwise erase
// the layers beneath
const defined = <T extends object>(object: T | undefined): Partial<T> =>
  Object.fromEntries(
    Object.entries(object ?? {}).filter(([, value]) => value !== undefined)
  ) as Partial<T>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
