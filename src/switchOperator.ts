import { type OperatorInfo } from 'fig-tree-evaluator'
import { cleanNode } from './cleanNode'

// A full operator node switched to `target`, a canonical name, from the
// operator picker (design, topic 2, "Node lifecycle"):
//
// - Choosing the node's own operator again changes nothing. A modifier-click
//   on the DisplayBar's button writes its name or alias.
// - Choosing another keeps the node's spelling where the new operator allows
//   it (`+` to `*`, and `+` to `?` for `if`), otherwise takes the canonical
//   name, then cleans the node: the parameters the new operator also declares
//   and the modifiers stay, and the rest go. The fill-in step seeds the new
//   operator's missing required parameters when the switch is committed.
//
// - Choosing `literal` quotes the node: the node as it stands, its comment and
//   modifiers included, becomes the literal's content, since the usual reason
//   is a part of the tree read as an expression that should be data, and
//   everything quoted is quoted (design, topic 5, "`literal`"). Without
//   `quote`, on a node only just created, which has nothing worth quoting,
//   it switches as to any operator, less `value`, so the fill-in step seeds
//   the content.
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
  operators: readonly OperatorInfo[],
  { quote = true } = {}
): Record<string, unknown> => {
  const find = (name: string | null): Target | undefined =>
    name === LITERAL.name ? LITERAL : operators.find((operator) => operator.name === name)
  const next = find(target)
  if (next === undefined) return node
  const written = node.operator

  if (target === current) return node
  if (target === LITERAL.name && quote) return { operator: LITERAL.name, value: node }

  const from = find(current)
  const usesAlias = from?.alias !== undefined && written === from.alias
  const spelling = usesAlias && next.alias !== undefined ? next.alias : next.name
  const switched = cleanNode({ ...node, operator: spelling }, { kind: 'operator', operator: next })
  if (target !== LITERAL.name) return switched
  const { value: _, ...unseeded } = switched
  return unseeded
}
