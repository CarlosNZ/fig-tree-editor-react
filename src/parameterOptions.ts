import { type OperatorInfo } from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/editor-hints'
import { type RowKind } from './classify'
import { type DisplayData } from './displayData'
import { parameterOrder } from './fillAndTidy'
import { getStartingValue } from './getStartingValue'
import { strings } from './strings'

// What can be added to a node (design, topic 4, "Adding parameters and
// starting values", and topic 2, "Guards"), offered by the toolbar's "Add
// parameter" and by json-edit-react's ＋ on the node's row:
//
// - A full operator node: its declared parameters not yet present, missing
//   required ones first, then the rest in fill-in's key order; then the
//   modifiers not yet present.
// - A full fragment call: `parameters` where it has none, then the modifiers
//   other than `useCache`, which fragment calls don't allow. Its arguments are
//   added inside `parameters`.
// - A shorthand node: the modifiers, since any other key makes it malformed.
// - A `literal`: `//` only, since the other modifiers are dead there.
// - A broken node (an unknown operator or fragment, or a malformed node): the
//   modifiers only, since the editor can't say what else belongs.
//
// Anything else takes a free-typed key.

export interface AddableKey {
  key: string // as it will appear in the tree
  required: boolean
  description?: string
}

export interface AddableKeys {
  parameters: AddableKey[]
  modifiers: AddableKey[]
}

export interface AddContext {
  operators: readonly OperatorInfo[]
  displayData: DisplayData
  useCache: boolean | undefined // the instance's `useCache` option
}

const MODIFIERS: AddableKey[] = [
  { key: '//', required: false, description: strings.FT_MODIFIER_COMMENT },
  { key: 'fallback', required: false, description: strings.FT_MODIFIER_FALLBACK },
  { key: 'useCache', required: false, description: strings.FT_MODIFIER_USE_CACHE },
  { key: 'vars', required: false, description: strings.FT_MODIFIER_VARS },
]

// Null where the key is free-typed
export const addableKeys = (
  node: Record<string, unknown>,
  kind: RowKind | undefined,
  { operators }: Pick<AddContext, 'operators'>
): AddableKeys | null => {
  const absent = (entries: AddableKey[]) => entries.filter(({ key }) => !(key in node))
  switch (kind?.kind) {
    case 'literal':
      return { parameters: [], modifiers: absent(MODIFIERS.slice(0, 1)) }
    case 'fragment': {
      const modifiers = absent(MODIFIERS.filter(({ key }) => key !== 'useCache'))
      const broken = kind.malformed !== undefined || !kind.registered
      return {
        parameters:
          kind.form === 'full' && !broken
            ? absent([{ key: 'parameters', required: false, description: strings.FT_ARGUMENTS }])
            : [],
        modifiers,
      }
    }
    case 'operator': {
      const operator = operators.find(({ name }) => name === kind.operator)
      const declared =
        kind.form === 'full' && kind.malformed === undefined && operator !== undefined
      return {
        parameters: declared ? absent(parametersOf(operator)) : [],
        modifiers: absent(MODIFIERS),
      }
    }
    default:
      return null
  }
}

// Required first, each in fill-in's key order
const parametersOf = (operator: OperatorInfo): AddableKey[] => {
  const entries = parameterOrder(operator).map((key) => {
    const { required, description } = operator.parameters[key]
    return { key, required, description }
  })
  return [...entries.filter(({ required }) => required), ...entries.filter((e) => !e.required)]
}

// The value a key added to a row starts as: a declared parameter's by the
// starting-value rule, a modifier's by its own (`useCache` the opposite of
// its effective setting, so adding it changes something), a fragment call's
// `parameters` empty, and a free-typed key, which admits anything, the `any`
// seed
export const getNewKeyValue = (
  key: string,
  kind: RowKind | undefined,
  { operators, displayData, useCache }: AddContext
): unknown => {
  const isNode = kind?.kind === 'operator' || kind?.kind === 'fragment' || kind?.kind === 'literal'
  if (!isNode) return structuredClone(typeSeeds.any)
  const operator =
    kind.kind === 'operator' ? operators.find(({ name }) => name === kind.operator) : undefined
  const declaration = operator?.parameters[key]
  if (operator && declaration)
    return getStartingValue(key, declaration, displayData.operators[operator.name]?.seeds ?? {})
  switch (key) {
    case '//':
      return strings.FT_NEW_COMMENT
    case 'fallback':
      return null
    case 'useCache':
      return !(operator?.instanceUseCache ?? useCache ?? operator?.useCache ?? false)
    case 'vars':
      return {}
    case 'parameters':
      if (kind.kind === 'fragment') return {}
  }
  return structuredClone(typeSeeds.any)
}
