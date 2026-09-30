import { type FragmentInfo } from 'fig-tree-evaluator'
import { cleanNode } from './cleanNode'

// A full fragment call switched to the fragment `target`, from the fragment
// picker (design, topic 6, "Switching fragment"). Choosing the call's own
// fragment again changes nothing, since fragments have no aliases. Choosing
// another cleans the call: the modifiers and the static arguments the new
// fragment also declares stay, dynamic arguments stay as they are, and a
// static map left empty goes. The fill-in step seeds the new fragment's
// missing required arguments when the switch is committed.
//
// `current` is null on a broken call, whose every choice is a switch: it
// repairs the call.
export const switchFragment = (
  node: Record<string, unknown>,
  target: string,
  current: string | null,
  fragments: readonly FragmentInfo[]
): Record<string, unknown> => {
  const next = fragments.find(({ name }) => name === target)
  if (next === undefined || target === current) return node
  return cleanNode({ ...node, fragment: target }, { kind: 'fragment', fragment: next })
}
