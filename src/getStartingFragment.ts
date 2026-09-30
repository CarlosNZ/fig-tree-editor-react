import { type ExpectedType, type FragmentInfo } from 'fig-tree-evaluator'
import { type DisplayData } from './displayData'
import { fragmentOptions } from './fragmentOptions'

// The call a new fragment call starts as at a slot (design, topic 6, "The
// fragment picker", and topic 8, "Defaults and what the pickers offer"): the
// host's `defaultFragment` where it is registered and can fit the slot,
// otherwise the first fragment the picker offers there. Null where none can
// fit, so the type dropdown leaves Fragment out. The fill-in step seeds its
// required arguments when it's committed.

export interface StartingFragmentContext {
  fragments: readonly FragmentInfo[]
  displayData: DisplayData
  defaultFragment?: string
}

export const getStartingFragment = (
  admits: ExpectedType,
  { fragments, displayData, defaultFragment }: StartingFragmentContext
): { fragment: string } | null => {
  const fitting = fragmentOptions({ fragments, displayData, admits, current: null })
    .flatMap(({ options }) => options)
    .filter(({ disabled }) => !disabled)
    .map(({ value }) => value)
  const name = fitting.find((candidate) => candidate === defaultFragment) ?? fitting[0]
  return name === undefined ? null : { fragment: name }
}
