import { type ExpectedType, type FigTree } from 'fig-tree-evaluator'
import { type DisplayData } from './displayData'
import { operatorOptions } from './operatorOptions'
import { Select } from './Select'
import { strings } from './strings'
import { switchOperator } from './switchOperator'

// The toolbar's operator picker (design, topic 4, "The operator picker"). It
// opens by itself only on a broken node, with the operator fig-tree suggests
// highlighted, so the pencil then Enter repairs it. Choosing an operator
// switches the node, and choosing the current one again toggles its spelling.

interface OperatorPickerProps {
  figTree: FigTree
  displayData: DisplayData
  admits: ExpectedType // what the node's position admits
  node: Record<string, unknown>
  current: string | null // the canonical operator; null on a broken node
  suggestion: string | undefined // an unknown operator's suggestion, perhaps an alias
  onSwitch: (next: Record<string, unknown>, target: string) => void
}

export const OperatorPicker = ({
  figTree,
  displayData,
  admits,
  node,
  current,
  suggestion,
  onSwitch,
}: OperatorPickerProps) => {
  const operators = figTree.getOperators()
  const written = typeof node.operator === 'string' ? node.operator : ''
  const groups = operatorOptions({
    operators,
    displayData,
    admits,
    current: current === null ? null : { operator: current, written },
  })
  const suggested = operators.find(
    ({ name, alias }) => suggestion !== undefined && (name === suggestion || alias === suggestion)
  )?.name

  return (
    <Select
      className="ft-operator-picker"
      optionGroups={groups}
      selected={current}
      highlighted={suggested}
      startOpen={current === null}
      search
      border="group"
      placeholder={strings.FT_PICKER_PLACEHOLDER}
      setSelected={({ value }) => {
        const next = switchOperator(node, value, current, operators)
        if (next !== node) onSwitch(next, value)
      }}
    />
  )
}
