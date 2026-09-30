import { type BasicType, type ExpectedType, type OperatorInfo } from 'fig-tree-evaluator'
import { typesIntersect } from 'fig-tree-evaluator/format'
import { cleanNode } from './cleanNode'
import { type DisplayData } from './displayData'
import { operatorOptions } from './operatorOptions'

// The node a new node starts as at a slot (design, topic 4, "The type
// dropdown", and topic 8, "Defaults and what the pickers offer"): the
// default operator for the slot's type, from the host's `defaultOperators`
// merged over the built-in map. A default that isn't registered, or can't fit
// the slot, gives way to the `any` entry, then to the first operator the
// picker offers there, so a new node is never an error from the start.
//
// A name is used as written, so a host's alias stays. A whole node is copied
// and cleaned against its operator. Either way the fill-in step completes it
// when it's committed.

export type SlotType = 'any' | 'number' | 'string' | 'boolean' | 'array' | 'object'

// An operator name, or a whole full node: an object with an `operator` key is
// a node, and any other a map of slot types
export type OperatorDefault = string | { operator: string; [key: string]: unknown }
export type DefaultOperators = OperatorDefault | Partial<Record<SlotType, OperatorDefault>>

export interface StartingNodeContext {
  operators: readonly OperatorInfo[]
  displayData: DisplayData
  defaultOperators?: DefaultOperators
}

const BUILT_IN: Record<SlotType, OperatorDefault> = {
  any: 'plus',
  number: 'plus',
  string: 'buildString',
  boolean: 'equal',
  array: 'map',
  object: 'buildObject',
}

// fig-tree evaluates `literal` without registering it, and it returns its
// content, whatever that is
const LITERAL = { name: 'literal', parameters: { value: {} }, returns: 'any' as const }

export const getStartingNode = (
  admits: ExpectedType,
  { operators, displayData, defaultOperators }: StartingNodeContext
): Record<string, unknown> => {
  const defaults = mergeDefaults(defaultOperators)
  const find = (name: unknown) =>
    name === LITERAL.name
      ? LITERAL
      : operators.find((operator) => operator.name === name || operator.alias === name)
  const fitting = (entry: OperatorDefault) => {
    const operator = find(typeof entry === 'string' ? entry : entry.operator)
    return operator && typesIntersect(operator.returns, admits) ? operator : undefined
  }

  for (const entry of [defaults[slotType(admits)], defaults.any]) {
    const operator = fitting(entry)
    if (operator === undefined) continue
    if (typeof entry === 'string') return { operator: entry }
    return cleanNode(structuredClone(entry), { kind: 'operator', operator })
  }
  const first = operatorOptions({ operators, displayData, admits, current: null })
    .flatMap(({ options }) => options)
    .find(({ disabled }) => !disabled)
  return { operator: first!.value }
}

const mergeDefaults = (
  defaultOperators: DefaultOperators | undefined
): Record<SlotType, OperatorDefault> => {
  if (defaultOperators === undefined) return BUILT_IN
  if (typeof defaultOperators === 'string' || 'operator' in defaultOperators)
    return Object.fromEntries(
      Object.keys(BUILT_IN).map((type) => [type, defaultOperators])
    ) as Record<SlotType, OperatorDefault>
  const merged = { ...BUILT_IN }
  for (const [type, entry] of Object.entries(defaultOperators))
    if (entry !== undefined && type in BUILT_IN) merged[type as SlotType] = entry
  return merged
}

// The entry a slot finds by its type: its own, `integer` taking `number`'s; a
// union's first non-null member with an entry; a literal union's by its
// members' types. Anything else takes `any`'s.
const slotType = (admits: ExpectedType): SlotType => {
  const members: readonly BasicType[] =
    typeof admits === 'string'
      ? [admits]
      : 'literal' in admits
        ? admits.literal.map((member) => typeof member as 'string' | 'number' | 'boolean')
        : admits
  for (const member of members) {
    const type = member === 'integer' ? 'number' : member
    if (type in BUILT_IN) return type as SlotType
  }
  return 'any'
}
