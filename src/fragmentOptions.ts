import { type ExpectedType, type FragmentInfo } from 'fig-tree-evaluator'
import { typesIntersect } from 'fig-tree-evaluator/format'
import { describeType } from './describeType'
import { type DisplayData } from './displayData'
import { type OptionGroup, type SelectOption } from './Select'
import { strings } from './strings'

// The fragment picker's entries (design, topic 6, "The fragment picker"): one
// flat list in `getFragments()` order, which is the order of the host's
// `fragments`, each labelled with its display name, or its name where it has
// none, with its description beneath. Search matches the label, and the name
// as a keyword.
//
// A fragment whose `returns`, inferred from its body at registration, shares
// no value with what the call's position admits goes in a final "Not valid
// here" group, as operators do, which can't be chosen, with the reason in
// place of its description. The current fragment stays in the list, and can
// be chosen, even where it doesn't fit.
//
// In fragment mode, the fragments whose use would close a cycle
// (`closingCycles`) are left out, but for the current one.

export interface FragmentPickerContext {
  fragments: readonly FragmentInfo[]
  displayData: DisplayData
  admits: ExpectedType // what the call's own position admits
  current: string | null // null on a broken call
  excludedFragments?: readonly string[]
}

export const fragmentOptions = ({
  fragments: registered,
  displayData,
  admits,
  current,
  excludedFragments = [],
}: FragmentPickerContext): OptionGroup<string>[] => {
  const fragments = registered.filter(
    ({ name }) => name === current || !excludedFragments.includes(name)
  )
  const option = ({ name, returns }: FragmentInfo, fits: boolean): SelectOption<string> => {
    const display = displayData.fragments[name]
    return {
      label: display?.displayName ?? name,
      description: fits
        ? display?.description
        : strings.FT_PICKER_NOT_VALID_REASON(describeType(returns), describeType(admits)),
      keywords: name,
      disabled: !fits,
      value: name,
    }
  }

  const fits = ({ name, returns }: FragmentInfo) =>
    name === current || typesIntersect(returns, admits)

  const valid = fragments.filter(fits).map((fragment) => option(fragment, true))
  const notValid = fragments
    .filter((fragment) => !fits(fragment))
    .map((fragment) => option(fragment, false))

  return [{ options: valid }, { label: strings.FT_PICKER_NOT_VALID, options: notValid }].filter(
    (group) => group.options.length > 0
  )
}

// The fragments a fragment body can't call (fragment-editor-design.md, "The
// fragment picker"): the fragment being defined, where it is registered, and
// every fragment that calls it, directly or through others. Registration
// refuses a cycle, so these are the only ones a body could close. A fragment
// with no name isn't registered, so nothing calls it.
export const closingCycles = (fragments: readonly FragmentInfo[], fragmentName: string) =>
  fragments
    .filter(
      ({ name, dependencies }) =>
        name === fragmentName || dependencies.fragments.includes(fragmentName)
    )
    .map(({ name }) => name)
