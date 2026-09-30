export interface SelectOption<T> {
  label: string
  hint?: string // after the label in the list, but not when closed, nor searched
  description?: string
  keywords?: string // matched by search, but not shown
  disabled?: boolean // shown and found by search, but can't be chosen
  value: T
}

// A heading over its options, never chosen itself. A group with no label
// has no heading, so its options follow whatever is above them.
export interface OptionGroup<T> {
  label?: string
  description?: string
  options: SelectOption<T>[]
}

export interface SelectProps<T> {
  options?: SelectOption<T>[]
  optionGroups?: OptionGroup<T>[]
  selected: string | null // the selected option's value
  setSelected: (selection: SelectOption<T>) => void
  search?: boolean
  placeholder?: string
  className: string
  border?: 'group' | 'all'
  startOpen?: boolean
  highlighted?: string | null // the value to highlight when the list opens
  emptyText?: string // shown when there are no options at all
}
