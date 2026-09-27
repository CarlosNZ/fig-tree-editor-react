export interface SelectOption<T> {
  label: string
  description?: string
  value: T
}

export interface OptionGroup<T> {
  label: string
  description?: string
  value: T
  options: SelectOption<T>[]
}

export interface SelectProps<T> {
  options?: SelectOption<T>[]
  optionGroups?: OptionGroup<T>[]
  selected: string | null
  setSelected: (selection: SelectOption<T>) => void
  search?: boolean
  placeholder?: string
  className: string
  border?: 'group' | 'all'
  startOpen?: boolean
}
