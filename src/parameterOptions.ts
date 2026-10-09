import { type FragmentInfo, type OperatorInfo } from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { takesNoCache } from './caching'
import { type Classification, type RowKind } from './classify'
import { type DisplayData, type OperatorDisplay } from './displayData'
import { parameterOrder } from './fillAndTidy'
import { getStartingValue } from './getStartingValue'
import { type Path } from './paths'
import { strings } from './strings'

// What can be added to a node (design, topic 4, "Adding parameters and
// starting values", and topic 2, "Guards"), offered by the toolbar's "Add
// parameter" and by json-edit-react's ＋ on the node's row:
//
// - A full operator node: its declared parameters not yet present, missing
//   required ones first, then the rest in fill-in's key order; then the
//   modifiers not yet present.
// - A full fragment call: its declared arguments not yet present, missing
//   required ones first, then the rest in declared order, each added inside
//   `parameters`, creating it where absent; then "Dynamic arguments", which
//   replaces them with a reference to compute them from. A call with dynamic
//   arguments has "Static arguments" in their place, which replaces the
//   reference or node with a map of arguments. Then the modifiers not yet
//   present.
// - A shorthand node: the modifiers, since any other key makes it malformed.
//
// `noCache` is among the modifiers only where it would do something, as
// `validate()` has it: something at or beneath the node caches, and no node
// above it has `noCache` already. fig-tree warns of the rest as dead or
// redundant.
// - A `literal`: `//` only, since the other modifiers are dead there.
// - A broken node (an unknown operator or fragment, or a malformed node): the
//   modifiers only, since the editor can't say what else belongs.
//
// Anything else takes a free-typed key.

export interface AddableKey {
  key: string // as it will appear in the tree
  required: boolean
  description?: string
  label?: string // in place of the key, for an entry that replaces a value
  argument?: true // a fragment call's, added inside its `parameters`
}

export interface AddableKeys {
  parameters: AddableKey[]
  modifiers: AddableKey[]
}

export interface AddContext {
  classification: Classification
  operators: readonly OperatorInfo[]
  fragments: readonly FragmentInfo[]
  displayData: DisplayData
}

const MODIFIERS: AddableKey[] = [
  { key: '//', required: false, description: strings.FT_MODIFIER_COMMENT },
  { key: 'fallback', required: false, description: strings.FT_MODIFIER_FALLBACK },
  { key: 'noCache', required: false, description: strings.FT_MODIFIER_NO_CACHE },
  { key: 'vars', required: false, description: strings.FT_MODIFIER_VARS },
]

// A node's comment is offered again while it is a note or lines, and adds a
// line to it (plan, 9.4)
const COMMENT_LINE: AddableKey = {
  key: '//',
  required: false,
  description: strings.FT_MODIFIER_COMMENT_LINE,
}
const takesLine = (comment: unknown) => typeof comment === 'string' || Array.isArray(comment)

// Null where the key is free-typed. An operator's parameters take their
// descriptions from `displayData`, which only a listing of them needs.
export const addableKeys = (
  node: Record<string, unknown>,
  path: Path,
  kind: RowKind | undefined,
  context: Pick<AddContext, 'classification' | 'operators' | 'fragments'> &
    Partial<Pick<AddContext, 'displayData'>>
): AddableKeys | null => {
  const absent = (entries: AddableKey[]) =>
    entries.flatMap((entry) => {
      if (!(entry.key in node)) return [entry]
      return entry.key === '//' && takesLine(node['//']) ? [COMMENT_LINE] : []
    })
  const modifiers = () =>
    absent(MODIFIERS.filter(({ key }) => key !== 'noCache' || takesNoCache(path, context)))
  switch (kind?.kind) {
    case 'literal':
      return { parameters: [], modifiers: absent(MODIFIERS.slice(0, 1)) }
    case 'fragment': {
      const fragment = context.fragments.find(({ name }) => name === kind.name)
      const declared = kind.form === 'full' && kind.malformed === undefined && fragment
      return {
        parameters: declared ? argumentsOf(node, kind, fragment) : [],
        modifiers: modifiers(),
      }
    }
    case 'operator': {
      const operator = context.operators.find(({ name }) => name === kind.operator)
      const declared =
        kind.form === 'full' && kind.malformed === undefined && operator !== undefined
      return {
        parameters: declared
          ? absent(parametersOf(operator, context.displayData?.operators[operator.name]))
          : [],
        modifiers: modifiers(),
      }
    }
    default:
      return null
  }
}

// The arguments not yet in a static map, then the switch to the other kind
// of arguments. A fragment that declares none has no use for dynamic ones.
const argumentsOf = (
  node: Record<string, unknown>,
  kind: FragmentKind,
  fragment: FragmentInfo
): AddableKey[] => {
  if (kind.arguments === 'dynamic' || kind.arguments === 'invalid') return [STATIC_ARGUMENTS]
  const present = isObject(node.parameters) ? node.parameters : {}
  const entries = Object.entries(fragment.parameters)
    .filter(([key]) => !(key in present))
    .map(([key, { required, description }]): AddableKey => ({
      key,
      required,
      description,
      argument: true,
    }))
  return [
    ...entries.filter(({ required }) => required),
    ...entries.filter(({ required }) => !required),
    ...(Object.keys(fragment.parameters).length > 0 ? [DYNAMIC_ARGUMENTS] : []),
  ]
}

const DYNAMIC_ARGUMENTS: AddableKey = {
  key: 'parameters',
  label: strings.FT_DYNAMIC_ARGUMENTS,
  required: false,
  description: strings.FT_DYNAMIC_ARGUMENTS_DESCRIPTION,
}
const STATIC_ARGUMENTS: AddableKey = {
  key: 'parameters',
  label: strings.FT_STATIC_ARGUMENTS,
  required: false,
  description: strings.FT_STATIC_ARGUMENTS_DESCRIPTION,
}

// Required first, each in fill-in's key order
const parametersOf = (operator: OperatorInfo, display?: OperatorDisplay): AddableKey[] => {
  const entries = parameterOrder(operator).map((key) => ({
    key,
    required: operator.parameters[key].required,
    description: display?.parameterDescriptions[key],
  }))
  return [...entries.filter(({ required }) => required), ...entries.filter((e) => !e.required)]
}

// A node with an entry of `addableKeys` added. An argument goes inside the
// call's `parameters`, creating it where absent. Switching to dynamic
// arguments starts them as the whole of `$data`, as the type dropdown's Data
// entry does, and switching to static starts them empty, for the fill-in step
// to seed the required ones. A line added to a comment goes at its end, a
// string comment becoming its first line.
export const addKey = (
  node: Record<string, unknown>,
  entry: AddableKey,
  kind: RowKind | undefined,
  context: AddContext
): Record<string, unknown> => {
  if (kind?.kind === 'fragment' && entry.argument) {
    const fragment = context.fragments.find(({ name }) => name === kind.name)
    const declaration = fragment?.parameters[entry.key]
    const seeds = context.displayData.fragments[fragment?.name ?? '']?.seeds ?? {}
    const value = declaration
      ? getStartingValue(entry.key, declaration, seeds)
      : structuredClone(typeSeeds.any)
    const present = isObject(node.parameters) ? node.parameters : {}
    return { ...node, parameters: { ...present, [entry.key]: value } }
  }
  if (entry === COMMENT_LINE) {
    const comment = node['//']
    const lines: unknown[] = Array.isArray(comment) ? comment : [comment]
    return { ...node, '//': [...lines, strings.FT_NEW_COMMENT] }
  }
  if (entry === DYNAMIC_ARGUMENTS) return { ...node, parameters: '$data' }
  if (entry === STATIC_ARGUMENTS) return { ...node, parameters: {} }
  return { ...node, [entry.key]: getNewKeyValue(entry.key, kind, context) }
}

// The value a key added to a node starts as: a declared parameter's by the
// starting-value rule, a modifier's by its own (`noCache` as `true`, the only
// value it takes), and a free-typed key, which admits anything, the `any`
// seed
export const getNewKeyValue = (
  key: string,
  kind: RowKind | undefined,
  { operators, displayData }: Pick<AddContext, 'operators' | 'displayData'>
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
    case 'noCache':
      return true
    case 'vars':
      return {}
  }
  return structuredClone(typeSeeds.any)
}

type FragmentKind = Extract<RowKind, { kind: 'fragment' }>

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
