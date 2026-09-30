import { type FragmentInfo, type OperatorInfo } from 'fig-tree-evaluator'
import { rowAt, type Classification } from './classify'
import { type DisplayData } from './displayData'
import { getStartingFragment } from './getStartingFragment'
import { getStartingNode, type DefaultOperators } from './getStartingNode'
import { getSlotValue } from './getStartingValue'
import { type Path } from './paths'

// Switching a full node's type from the toolbar (design, topic 2, "Node
// lifecycle"), a structural action:
//
// - Operator to Fragment starts the slot's starting fragment, keeping `//`,
//   `vars` and `fallback`; `useCache` goes, since fragment calls don't allow
//   it.
// - Fragment to Operator starts the slot's default operator, keeping the same
//   modifiers.
// - Either to Value replaces the node with the starting value for its
//   position.
//
// The fill-in step seeds the new node's required parameters or arguments
// when the switch is committed. Fragment is offered only where a registered
// fragment can fit, as in the type dropdown.

export type NodeType = 'operator' | 'fragment' | 'value'

export interface NodeTypeContext {
  classification: Classification
  operators: readonly OperatorInfo[]
  fragments: readonly FragmentInfo[]
  displayData: DisplayData
  defaultOperators?: DefaultOperators
  defaultFragment?: string
}

const KEPT = ['//', 'vars', 'fallback']

export const nodeTypes = (path: Path, context: NodeTypeContext): NodeType[] => {
  const admits = rowAt(context.classification, path)?.slot?.admits ?? 'any'
  const fragment = getStartingFragment(admits, context)
  return fragment === null ? ['operator', 'value'] : ['operator', 'fragment', 'value']
}

export const switchNodeType = (
  node: Record<string, unknown>,
  target: NodeType,
  path: Path,
  context: NodeTypeContext
): unknown => {
  const slot = rowAt(context.classification, path)?.slot
  if (target === 'value') return getSlotValue(slot, context)
  const admits = slot?.admits ?? 'any'
  const start =
    target === 'operator'
      ? getStartingNode(admits, context)
      : (getStartingFragment(admits, context) ?? {})
  const kept = Object.fromEntries(Object.entries(node).filter(([key]) => KEPT.includes(key)))
  return { ...start, ...kept }
}
