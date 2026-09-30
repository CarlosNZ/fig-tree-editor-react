import {
  type BasicType,
  type ExpectedType,
  type FragmentInfo,
  type ReferenceNamespace,
} from 'fig-tree-evaluator'
import { typesIntersect } from 'fig-tree-evaluator/format'
import { type EnumDefinition, type TypeOptions } from 'json-edit-react'
import { type Row, type ScopeEntry } from './classify'
import { type ReferenceNames } from './conversions'
import { valueAt } from './paths'
import { strings } from './strings'

// The type dropdown's options for a value row (design, topic 4, "The type
// dropdown"). A row with a slot gets what its slot gives; any other row,
// which isn't evaluated, gets the six standard types. The order:
//
// 1. The types the slot admits, in declared order, `integer` as `number`,
//    with `null` only where the slot admits it. A literal union of strings
//    is one enum.
// 2. The reference entries: Data at every slot that isn't literal-only,
//    Variable where a var is in scope, and Element inside an iterator's
//    per-element parameter.
// 3. Operator, where Data is offered, then Fragment, where a registered
//    fragment can fit the slot, so choosing it never creates a call that is
//    an error from the start.
// 4. The row's current type, where it isn't already listed, so the dropdown
//    never shows a value it doesn't offer.

// The name each reference definition has in the dropdown, by namespace
export const REFERENCE_ENTRIES: Record<ReferenceNamespace, string> = {
  data: strings.FT_TYPE_DATA,
  vars: strings.FT_TYPE_VARIABLE,
  element: strings.FT_TYPE_ELEMENT,
  index: strings.FT_TYPE_ELEMENT,
  params: strings.FT_TYPE_PARAMETER,
}

const STANDARD = ['string', 'number', 'boolean', 'null', 'object', 'array']

export const typeOptions = (
  row: Row | undefined,
  value: unknown,
  data: unknown,
  fragments: readonly FragmentInfo[]
): TypeOptions => {
  const { slot, scope = [] } = row ?? {}
  const options: TypeOptions = slot ? admitted(slot.admits) : [...STANDARD]
  if (slot && !slot.literalOnly) {
    options.push(REFERENCE_ENTRIES.data)
    if (nearestVar(scope, data) !== undefined) options.push(REFERENCE_ENTRIES.vars)
    if (nearestIterator(scope) !== undefined) options.push(REFERENCE_ENTRIES.element)
    options.push(strings.FT_TYPE_OPERATOR)
    const admits = slot.admits
    if (fragments.some(({ returns }) => typesIntersect(returns, admits)))
      options.push(strings.FT_TYPE_FRAGMENT)
  }
  const current = currentType(row, value, options)
  if (current !== undefined && !options.includes(current)) options.push(current)
  return options
}

const admitted = (admits: ExpectedType): TypeOptions => {
  if (typeof admits === 'string') return admits === 'any' ? [...STANDARD] : [standard(admits)]
  if ('literal' in admits) {
    const { literal } = admits
    if (literal.every((member) => typeof member === 'string'))
      return [{ enum: strings.FT_TYPE_OPTION, values: [...literal], matchPriority: 1 }]
    return unique(literal.map((member) => typeof member))
  }
  if (admits.includes('any')) return [...STANDARD]
  return unique(admits.map(standard))
}

const standard = (type: BasicType) => (type === 'integer' ? 'number' : type)

const unique = (types: string[]) => [...new Set(types)]

// What json-edit-react shows as the row's type: a reference's entry, an
// enum a string belongs to, otherwise the value's own type
const currentType = (row: Row | undefined, value: unknown, options: TypeOptions) => {
  const kind = row?.kind
  if (kind?.kind === 'reference') return REFERENCE_ENTRIES[kind.namespace]
  const inEnum = options.find(
    (option): option is EnumDefinition =>
      typeof option === 'object' && typeof value === 'string' && option.values.includes(value)
  )
  if (inEnum) return undefined
  if (value === null) return 'null'
  if (['string', 'number', 'boolean'].includes(typeof value)) return typeof value
  return undefined
}

// ── The reference entries' starting values ─────────────────────────────────

// Data is `$data.`, for the path to be typed after it; a var is the first of
// the nearest block that has one; an element is the innermost iterator's, by
// its `as` name where it has one. Each is valid where it's offered, and
// spelled by `referenceNames`.
export const referenceStart = (
  namespace: 'data' | 'vars' | 'element',
  row: Row | undefined,
  data: unknown,
  referenceNames: ReferenceNames = 'canonical'
) => {
  const scope = row?.scope ?? []
  const token = NAMESPACE_TOKENS[referenceNames]
  if (namespace === 'vars') {
    const name = nearestVar(scope, data)
    return name === undefined ? token.vars : `${token.vars}.${name}`
  }
  if (namespace === 'element') {
    const iterator = nearestIterator(scope)
    return iterator?.as === undefined ? token.element : `$${iterator.as}`
  }
  return `${token.data}.`
}

const NAMESPACE_TOKENS = {
  canonical: { data: '$data', vars: '$vars', element: '$element' },
  alias: { data: '$d', vars: '$v', element: '$e' },
}

const nearestVar = (scope: readonly ScopeEntry[], data: unknown) => {
  for (const entry of [...scope].reverse()) {
    if (entry.kind !== 'vars') continue
    const block = valueAt(data, entry.path) as Record<string, unknown>
    const name = Object.keys(block).find((key) => key !== '//')
    if (name !== undefined) return name
  }
  return undefined
}

const nearestIterator = (scope: readonly ScopeEntry[]) =>
  [...scope].reverse().find((entry) => entry.kind === 'iterator')
