import {
  OPERATOR_CATEGORIES,
  type CatalogOperator,
  type CategoryListing,
  type FragmentInfo,
  type FragmentMetadata,
  type OperatorCategory,
  type OperatorInfo,
  type OperatorListing,
  type OperatorListingMap,
} from 'fig-tree-evaluator'
import {
  categoryListings as coreCategoryListings,
  getCatalog,
  operatorListings as coreOperatorListings,
} from 'fig-tree-evaluator/catalog'
import { strings } from './strings'

// How operators, categories and fragments are shown: names, text, links,
// colours, and the seeds the starting-value rule reads.
//
// An operator's comes from `./catalog`'s `getCatalog`, which merges its
// listings field by field, `seeds` and `parameterDescriptions` per parameter,
// lowest first: the package's own, then the editor's (`literal`'s
// description, and a host operator's colours), then an operator's own
// `metadata` read as an `OperatorListing`, then the host's `operatorListings`
// prop. Categories take the host's `categoryListings` prop over the
// package's, field by field.

export type OperatorListingsProp = OperatorListingMap
export type CategoryListingsProp = { [category in OperatorCategory]?: Partial<CategoryListing> }

export interface OperatorDisplay {
  displayName: string
  description?: string
  parameterDescriptions: Record<string, string>
  docUrl?: string
  backgroundColor: string
  textColor: string
  seeds: Record<string, unknown> // every declared parameter's starting value
}

export interface CategoryDisplay extends CategoryListing {
  category: OperatorCategory
}

// A fragment's display is its definition's `metadata`, a `FragmentMetadata`
// by a convention fig-tree never checks, so every field may be missing. Its
// fallbacks (the "Fragment" label, `editorTheme`'s fragment colours) apply
// where it is drawn, which is why the editor reads it itself rather than
// through `getCatalog`, whose display name falls back to the name.
export interface FragmentDisplay extends Omit<FragmentMetadata, 'seeds'> {
  description?: string // the definition's own
  seeds: Record<string, unknown>
}

export interface DisplayData {
  operators: Record<string, OperatorDisplay> // by canonical name
  categories: CategoryDisplay[] // in `order`
  fragments: Record<string, FragmentDisplay>
}

interface Registry {
  operators: OperatorInfo[]
  fragments: FragmentInfo[]
  operatorListings?: OperatorListingsProp
  categoryListings?: CategoryListingsProp
}

// fig-tree evaluates `literal` without listing it among `getOperators()`, so
// the editor adds it to what `getCatalog` reads, with Data & objects, since
// it produces data verbatim. Only its name, category and parameter types are
// read there.
const LITERAL = {
  name: 'literal',
  category: 'data',
  parameters: { value: { type: 'any' } },
} as unknown as OperatorInfo

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
    categories.find((entry) => entry.category === category)!.backgroundColor

  const shown = operators.some(({ name }) => name === LITERAL.name)
    ? operators
    : [...operators, LITERAL]

  // `./catalog` gives `literal` no description. An operator it has no
  // listing for takes shades of its category's colour, as the host's
  // categories have it, under any colours of its own.
  const editorListings: OperatorListingMap = {
    literal: { description: strings.FT_LITERAL_DESCRIPTION },
  }
  for (const { name, category } of shown)
    if (!Object.prototype.hasOwnProperty.call(coreOperatorListings, name))
      editorListings[name] = {
        backgroundColor: lightShade(categoryColour(category)),
        textColor: darkShade(categoryColour(category)),
      }
  const metadataListings: OperatorListingMap = Object.fromEntries(
    shown.flatMap(({ name, metadata }) =>
      metadata === undefined ? [] : [[name, readOperatorListing(metadata)]]
    )
  )

  const catalog = getCatalog(
    { getOperators: () => shown, getFragments: () => [] },
    editorListings,
    metadataListings,
    operatorListings
  )

  return {
    operators: Object.fromEntries(
      catalog.operators.map((operator) => [operator.name, operatorDisplay(operator)])
    ),
    categories,
    fragments: Object.fromEntries(
      fragments.map(({ name, description, metadata }) => {
        const { seeds = {}, ...listing } = readListing(metadata)
        return [name, { ...listing, seeds, ...(description !== undefined && { description }) }]
      })
    ),
  }
}

const operatorDisplay = ({
  displayName,
  description,
  docUrl,
  backgroundColor,
  textColor,
  parameters,
}: CatalogOperator): OperatorDisplay => {
  const entries = Object.entries(parameters)
  return {
    displayName,
    description,
    parameterDescriptions: Object.fromEntries(
      entries.flatMap(([key, { description }]) =>
        description === undefined ? [] : [[key, description]]
      )
    ),
    docUrl,
    backgroundColor,
    textColor,
    seeds: Object.fromEntries(entries.map(([key, { seed }]) => [key, seed])),
  }
}

// A host operator with no colours of its own takes a light shade of its
// category's colour, so it sits with its category's siblings. Derived in CSS,
// so a category colour can be any CSS colour.
export const lightShade = (colour: string) => `color-mix(in srgb, ${colour} 18%, white)`
export const darkShade = (colour: string) => `color-mix(in srgb, ${colour}, black 65%)`

const LISTING_FIELDS = ['displayName', 'docUrl', 'backgroundColor', 'textColor'] as const

// `metadata` is the definition's own record, so only fields of the right type
// are read from it
const readListing = (metadata: Record<string, unknown> | undefined) => {
  const listing: FragmentMetadata = {}
  if (!metadata) return listing
  for (const field of LISTING_FIELDS) {
    const value = metadata[field]
    if (typeof value === 'string') listing[field] = value
  }
  const { seeds } = metadata
  if (isRecord(seeds)) listing.seeds = seeds
  return listing
}

// An operator's listing also carries its text, which a fragment's takes from
// its definition
const readOperatorListing = (metadata: Record<string, unknown>) => {
  const listing: OperatorListing = readListing(metadata)
  const { description, parameterDescriptions } = metadata
  if (typeof description === 'string') listing.description = description
  if (isRecord(parameterDescriptions))
    listing.parameterDescriptions = Object.fromEntries(
      Object.entries(parameterDescriptions).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  return listing
}

// Without the fields a host set to `undefined`, which would otherwise erase
// the layers beneath
const defined = <T extends object>(object: T | undefined): Partial<T> =>
  Object.fromEntries(
    Object.entries(object ?? {}).filter(([, value]) => value !== undefined)
  ) as Partial<T>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
