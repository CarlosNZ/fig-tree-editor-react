import React from 'react'
import { type OptionGroup, type SelectOption } from './types'

interface CommonMenuProps<T> {
  handleSelect: (option: SelectOption<T>) => void
  border?: 'group' | 'all'
}

interface DropdownMenuProps<T> extends CommonMenuProps<T> {
  currentSelectionRef: React.RefObject<HTMLDivElement>
  optionsRef: React.RefObject<HTMLDivElement>
  optionGroups?: OptionGroup<T>[]
  options: SelectOption<T>[]
  selected: string | null
  highlightedIndex: number
  search: boolean
}

export function DropdownMenu<T>({
  optionsRef,
  currentSelectionRef,
  optionGroups,
  options,
  selected,
  handleSelect,
  highlightedIndex,
  border,
  search,
}: DropdownMenuProps<T>) {
  const allVisibleOptions = optionGroups
    ? optionGroups.flatMap((group) => group.options)
    : optionGroups

  return (
    <div ref={optionsRef} className="ft-select-dropdown">
      {allVisibleOptions?.length === 0 && (
        <div className={`ft-select-option ft-select-no-options`} tabIndex={0}>
          No results
        </div>
      )}
      {optionGroups
        ? optionGroups.map((group, groupIndex) => (
            <DropdownOptionGroup
              key={group.label}
              group={group}
              handleSelect={handleSelect}
              border={border}
              isSelected={group.value === selected}
              isHighlighted={highlightedIndex === groupIndex}
              currentSelectionRef={group.value === selected ? currentSelectionRef : undefined}
            >
              {group.options.map((option, optionIndex) => (
                <DropdownOption
                  key={option.label}
                  option={option}
                  handleSelect={handleSelect}
                  border={border}
                  isSelected={option.value === selected}
                  isHighlighted={highlightedIndex === optionIndex}
                  currentSelectionRef={option.value === selected ? currentSelectionRef : undefined}
                  index={optionIndex}
                  search={search}
                />
              ))}
            </DropdownOptionGroup>
          ))
        : options.map((option, index) => (
            <DropdownOption
              key={option.label}
              option={option}
              handleSelect={handleSelect}
              border={border}
              isSelected={option.value === selected || option.label === selected}
              isHighlighted={highlightedIndex === index}
              currentSelectionRef={currentSelectionRef}
              index={index}
              search={search}
            />
          ))}
    </div>
  )
}

interface CommonOptionProps<T> extends CommonMenuProps<T> {
  isSelected: boolean
  isHighlighted: boolean
  currentSelectionRef: React.RefObject<HTMLDivElement> | undefined
}

interface GroupProps<T> extends CommonOptionProps<T> {
  children: React.ReactNode
  group: OptionGroup<T>
}
function DropdownOptionGroup<T>({
  children,
  group,
  handleSelect,
  isSelected,
  isHighlighted,
  border,
  currentSelectionRef,
}: GroupProps<T>) {
  return (
    <div>
      <div
        ref={currentSelectionRef}
        className={`ft-select-group-label ${
          isHighlighted || isSelected ? 'ft-select-highlighted' : ''
        }${isSelected ? ' ft-select-selected' : ''}${
          border === 'group' || border === 'all' ? ' ft-option-border' : ''
        }`}
        onClick={() => handleSelect(group)}
      >
        <div className="ft-select-option-title">{group.label}</div>
        {group.description && (
          <div className="ft-select-option-description">{group.description}</div>
        )}
      </div>
      {children}
    </div>
  )
}

interface OptionProps<T> extends CommonOptionProps<T> {
  option: SelectOption<T>
  index: number
  search: boolean
}
function DropdownOption<T>({
  option,
  handleSelect,
  isSelected,
  isHighlighted,
  border,
  currentSelectionRef,
  index,
  search,
}: OptionProps<T>) {
  return (
    <div
      ref={currentSelectionRef}
      className={`ft-select-option${isHighlighted ? ' ft-select-highlighted' : ''}${
        isSelected ? ' ft-select-selected' : ''
      }${border === 'all' ? ' ft-option-border' : ''}`}
      onClick={() => handleSelect(option)}
      data-index={index}
      tabIndex={0}
      style={search ? { paddingLeft: '1.5em' } : { padding: '0.5em 0.75em' }}
    >
      <div className="ft-select-option-title">{option.label}</div>
      {option.description && (
        <div className="ft-select-option-description">{option.description}</div>
      )}
    </div>
  )
}
