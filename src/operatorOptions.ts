import { type ExpectedType, type OperatorInfo } from 'fig-tree-evaluator'
import { typesIntersect } from 'fig-tree-evaluator/format'
import { describeType } from './describeType'
import { type DisplayData } from './displayData'
import { type OptionGroup, type SelectOption } from './Select'
import { strings } from './strings'

// The operator picker's entries (design, topic 4, "The operator picker"): one
// per operator, grouped by category in the display data's order, each group
// in `getOperators()` order, with `literal` last in Data & objects. Empty
// groups are left out. Search matches the display name, which carries the
// alias, and the canonical name and alias as keywords.
//
// An operator whose declared `returns` shares no value with what the node's
// position admits goes in a final "Not valid here" group, which can't be
// chosen, with the reason as its description. Sharing only `null` counts as
// fitting, since `validate()` would accept it. The current operator stays in
// its group, and can be chosen, even where it doesn't fit, so choosing it
// again still toggles its spelling, which its hint says.

export interface PickerContext {
  operators: readonly OperatorInfo[]
  displayData: DisplayData
  admits: ExpectedType // what the node's own position admits
  current: { operator: string; written: string } | null // null on a broken node
}

type Candidate = Pick<OperatorInfo, 'name' | 'alias' | 'category' | 'returns'>

// fig-tree evaluates `literal` without registering it, and it returns its
// content, whatever that is
const LITERAL: Candidate = { name: 'literal', category: 'data', returns: 'any' }

export const operatorOptions = ({
  operators,
  displayData,
  admits,
  current,
}: PickerContext): OptionGroup<string>[] => {
  const candidates: readonly Candidate[] = operators.some(({ name }) => name === LITERAL.name)
    ? operators
    : [...operators, LITERAL]

  const option = ({ name, alias, returns }: Candidate, fits: boolean): SelectOption<string> => {
    const display = displayData.operators[name]
    const isCurrent = name === current?.operator
    return {
      label: display?.displayName ?? name,
      hint:
        isCurrent && alias !== undefined
          ? strings.FT_PICKER_TOGGLE_HINT(current.written === alias ? name : alias)
          : undefined,
      description: fits
        ? display?.description
        : strings.FT_PICKER_NOT_VALID_REASON(describeType(returns), describeType(admits)),
      keywords: alias === undefined ? name : `${name} ${alias}`,
      disabled: !fits,
      value: name,
    }
  }

  const fits = (candidate: Candidate) =>
    candidate.name === current?.operator || typesIntersect(candidate.returns, admits)

  const groups = displayData.categories.map(({ category, displayName }) => ({
    label: displayName,
    options: candidates
      .filter((candidate) => candidate.category === category && fits(candidate))
      .map((candidate) => option(candidate, true)),
  }))
  const notValid = displayData.categories.flatMap(({ category }) =>
    candidates
      .filter((candidate) => candidate.category === category && !fits(candidate))
      .map((candidate) => option(candidate, false))
  )

  return [...groups, { label: strings.FT_PICKER_NOT_VALID, options: notValid }].filter(
    (group) => group.options.length > 0
  )
}
