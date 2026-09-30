import {
  OPERATOR_CATEGORIES,
  type CategoryHints,
  type FragmentInfo,
  type OperatorCategory,
  type OperatorHints,
  type OperatorInfo,
} from 'fig-tree-evaluator'
import {
  categoryHints as coreCategoryHints,
  operatorHints as coreOperatorHints,
} from 'fig-tree-evaluator/editor-hints'
import { strings } from './strings'

// How operators, categories and fragments are shown: names, links, colours,
// and the seeds the starting-value rule reads. Layered, lowest first:
// `./editor-hints`, then an operator's own `metadata` read as
// `OperatorHints`, then the host's `operatorHints` and `categoryHints` props.
// Each field is merged over the layers beneath it, and `seeds` per parameter.

export type OperatorHintsProp = { [operator: string]: Partial<OperatorHints> }
export type CategoryHintsProp = { [category in OperatorCategory]?: Partial<CategoryHints> }

export interface OperatorDisplay {
  displayName: string
  description?: string // the definition's own, and the editor's for `literal`
  docUrl?: string
  backgroundColor: string
  textColor: string
  seeds: Record<string, unknown>
}

export interface CategoryDisplay extends CategoryHints {
  category: OperatorCategory
}

// A fragment's display is `FragmentHints` in its own `metadata`, a convention
// fig-tree never checks, so every field may be missing. Its fallbacks (the
// "Fragment" label, `editorTheme`'s fragment colours) apply where it is drawn.
export interface FragmentDisplay extends Partial<Omit<OperatorHints, 'seeds'>> {
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
  operatorHints?: OperatorHintsProp
  categoryHints?: CategoryHintsProp
}

// fig-tree evaluates `literal` without listing it among `getOperators()`, so
// the editor adds it, with Data & objects, since it produces data verbatim.
const LITERAL = {
  name: 'literal',
  category: 'data' as const,
  description: strings.FT_LITERAL_DESCRIPTION,
  metadata: undefined,
}

export const buildDisplayData = ({
  operators,
  fragments,
  operatorHints = {},
  categoryHints = {},
}: Registry): DisplayData => {
  const categories = OPERATOR_CATEGORIES.map((category) => ({
    category,
    ...coreCategoryHints[category],
    ...defined(categoryHints[category]),
  })).sort((a, b) => a.order - b.order)
  const categoryColour = (category: OperatorCategory) =>
    categories.find((entry) => entry.category === category)!.backgroundColor

  const shown = operators.some(({ name }) => name === LITERAL.name)
    ? operators
    : [...operators, LITERAL]

  return {
    operators: Object.fromEntries(
      shown.map(({ name, category, description, metadata }) => {
        const { seeds, ...hints } = mergeHints([
          coreOperatorHints[name],
          readHints(metadata),
          operatorHints[name],
        ])
        return [
          name,
          {
            displayName: hints.displayName ?? name,
            description,
            docUrl: hints.docUrl,
            backgroundColor: hints.backgroundColor ?? lightShade(categoryColour(category)),
            textColor: hints.textColor ?? darkShade(categoryColour(category)),
            seeds,
          },
        ]
      })
    ),
    categories,
    fragments: Object.fromEntries(
      fragments.map(({ name, metadata }) => [name, mergeHints([readHints(metadata)])])
    ),
  }
}

// A host operator with no colours of its own takes a light shade of its
// category's colour, so it sits with its category's siblings. Derived in CSS,
// so a category colour can be any CSS colour.
export const lightShade = (colour: string) => `color-mix(in srgb, ${colour} 18%, white)`
export const darkShade = (colour: string) => `color-mix(in srgb, ${colour}, black 65%)`

const HINT_FIELDS = ['displayName', 'docUrl', 'backgroundColor', 'textColor'] as const

// `metadata` is the definition's own record, so only fields of the right type
// are read from it
const readHints = (metadata: Record<string, unknown> | undefined) => {
  const hints: Partial<OperatorHints> = {}
  if (!metadata) return hints
  for (const field of HINT_FIELDS) {
    const value = metadata[field]
    if (typeof value === 'string') hints[field] = value
  }
  const { seeds } = metadata
  if (isRecord(seeds)) hints.seeds = seeds
  return hints
}

const mergeHints = (layers: (Partial<OperatorHints> | undefined)[]) =>
  layers.reduce<FragmentDisplay>(
    (merged, layer = {}) => {
      const { seeds, ...fields } = defined(layer)
      return { ...merged, ...fields, seeds: { ...merged.seeds, ...seeds } }
    },
    { seeds: {} }
  )

// Without the fields a host set to `undefined`, which would otherwise erase
// the layers beneath
const defined = <T extends object>(object: T | undefined): Partial<T> =>
  Object.fromEntries(
    Object.entries(object ?? {}).filter(([, value]) => value !== undefined)
  ) as Partial<T>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
