import { type OperatorInfo } from 'fig-tree-evaluator'
import { cleanNode } from './cleanNode'

// A full operator node switched to `target`, a canonical name, from the
// operator picker (design, topic 2, "Node lifecycle"):
//
// - Choosing the node's own operator again toggles its spelling between name
//   and alias, and changes nothing else. With no alias, the node comes back
//   as it was.
// - Choosing another keeps the node's spelling where the new operator allows
//   it (`+` to `*`, and `+` to `?` for `if`), otherwise takes the canonical
//   name, then cleans the node: the parameters the new operator also declares
//   and the modifiers stay, and the rest go. The fill-in step seeds the new
//   operator's missing required parameters when the switch is committed.
//
// `current` is the node's canonical operator, or null on a broken node, whose
// every choice is a switch: it repairs the node.

type Target = Pick<OperatorInfo, 'name' | 'alias'> & { parameters: Record<string, unknown> }

// `literal`'s one parameter, since fig-tree registers no declaration for it
const LITERAL: Target = { name: 'literal', parameters: { value: {} } }

export const switchOperator = (
  node: Record<string, unknown>,
  target: string,
  current: string | null,
  operators: readonly OperatorInfo[]
): Record<string, unknown> => {
  const find = (name: string | null): Target | undefined =>
    name === LITERAL.name ? LITERAL : operators.find((operator) => operator.name === name)
  const next = find(target)
  if (next === undefined) return node
  const written = node.operator

  if (target === current) {
    if (next.alias === undefined) return node
    return { ...node, operator: written === next.alias ? next.name : next.alias }
  }

  const from = find(current)
  const usesAlias = from?.alias !== undefined && written === from.alias
  const spelling = usesAlias && next.alias !== undefined ? next.alias : next.name
  return cleanNode({ ...node, operator: spelling }, { kind: 'operator', operator: next })
}
