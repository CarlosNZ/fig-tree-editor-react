import { type OperatorInfo } from 'fig-tree-evaluator'

// An operator's other spelling (design, topic 2, "Name or alias"): its alias
// where it is written by name, and its name where written by alias. An
// operator with no alias has none. A modifier-click on the node's button
// writes it.
export const otherSpelling = (operator: OperatorInfo | undefined, name: string | null) => {
  if (operator?.alias === undefined) return undefined
  return name === operator.alias ? operator.name : operator.alias
}

// The modifier keys as a card names them: "Cmd/Ctrl". Any other key is named
// as the browser names it.
const MODIFIER_NAMES: Partial<Record<React.ModifierKey, string>> = {
  Meta: 'Cmd',
  Control: 'Ctrl',
}

export const modifierNames = (keys: readonly React.ModifierKey[]) =>
  keys.map((key) => MODIFIER_NAMES[key] ?? key).join('/')
