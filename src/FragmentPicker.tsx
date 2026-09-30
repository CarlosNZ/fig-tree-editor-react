import { type ExpectedType, type FigTree } from 'fig-tree-evaluator'
import { type DisplayData } from './displayData'
import { fragmentOptions } from './fragmentOptions'
import { Select } from './Select'
import { strings } from './strings'
import { switchFragment } from './switchFragment'

// The toolbar's fragment picker (design, topic 6, "The fragment picker"). It
// opens by itself on a broken call, with the fragment fig-tree suggests
// highlighted, and on a call the type dropdown has just created. Choosing a
// fragment switches the call, and choosing the current one again changes
// nothing.

interface FragmentPickerProps {
  figTree: FigTree
  displayData: DisplayData
  admits: ExpectedType // what the call's position admits
  node: Record<string, unknown>
  current: string | null // null on a broken call
  suggestion: string | undefined // an unknown fragment's suggestion
  startOpen: boolean // on a new call
  onSwitch: (next: Record<string, unknown>) => void
}

export const FragmentPicker = ({
  figTree,
  displayData,
  admits,
  node,
  current,
  suggestion,
  startOpen,
  onSwitch,
}: FragmentPickerProps) => {
  const fragments = figTree.getFragments()
  return (
    <Select
      className="ft-fragment-picker"
      optionGroups={fragmentOptions({ fragments, displayData, admits, current })}
      selected={current}
      highlighted={suggestion}
      startOpen={startOpen || current === null}
      search
      border="group"
      placeholder={strings.FT_FRAGMENT_PICKER_PLACEHOLDER}
      emptyText={strings.FT_NO_FRAGMENTS}
      setSelected={({ value }) => {
        const next = switchFragment(node, value, current, fragments)
        if (next !== node) onSwitch(next)
      }}
    />
  )
}
