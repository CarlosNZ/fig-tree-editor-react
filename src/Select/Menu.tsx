import React from 'react'
import { type SelectOption } from './types'

// An option shown in the list, with its index in display order
export interface MenuEntry<T> {
  option: SelectOption<T>
  index: number
}

// A heading, where the options are grouped, over the options it shows
export interface MenuGroup<T> {
  label?: string
  description?: string
  entries: MenuEntry<T>[]
}

interface DropdownMenuProps<T> {
  currentSelectionRef: React.RefObject<HTMLDivElement>
  optionsRef: React.RefObject<HTMLDivElement>
  groups: MenuGroup<T>[]
  selected: string | null
  handleSelect: (option: SelectOption<T>) => void
  highlightedIndex: number
  border?: 'group' | 'all'
  search: boolean
  emptyText: string // shown when no option matches, or there are none
}

export function DropdownMenu<T>({
  optionsRef,
  currentSelectionRef,
  groups,
  selected,
  handleSelect,
  highlightedIndex,
  border,
  search,
  emptyText,
}: DropdownMenuProps<T>) {
  return (
    <div ref={optionsRef} className="ft-select-dropdown">
      {groups.length === 0 && (
        <div className={`ft-select-option ft-select-no-options`} tabIndex={0}>
          {emptyText}
        </div>
      )}
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex}>
          {group.label !== undefined && (
            <div
              className={`ft-select-group-label${
                border === 'group' || border === 'all' ? ' ft-option-border' : ''
              }`}
            >
              <div className="ft-select-option-title">{group.label}</div>
              {group.description && (
                <div className="ft-select-option-description">{group.description}</div>
              )}
            </div>
          )}
          {group.entries.map(({ option, index }) => {
            const isSelected = option.value === selected
            return (
              <DropdownOption
                key={index}
                option={option}
                handleSelect={handleSelect}
                border={border}
                isSelected={isSelected}
                isHighlighted={index === highlightedIndex}
                currentSelectionRef={isSelected ? currentSelectionRef : undefined}
                index={index}
                search={search}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

interface OptionProps<T> {
  option: SelectOption<T>
  handleSelect: (option: SelectOption<T>) => void
  border?: 'group' | 'all'
  isSelected: boolean
  isHighlighted: boolean
  currentSelectionRef: React.RefObject<HTMLDivElement> | undefined
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
      }${option.disabled ? ' ft-select-disabled' : ''}${border === 'all' ? ' ft-option-border' : ''}`}
      onClick={() => handleSelect(option)}
      // A click on a disabled option leaves focus in the search field
      onMouseDown={option.disabled ? (e) => e.preventDefault() : undefined}
      data-index={index}
      aria-disabled={option.disabled ? true : undefined}
      tabIndex={option.disabled ? undefined : 0}
      style={search ? { paddingLeft: '1.5em' } : { padding: '0.5em 0.75em' }}
    >
      <div className="ft-select-option-title">
        {option.label}
        {option.hint && <span className="ft-select-option-hint">{option.hint}</span>}
      </div>
      {option.description && (
        <div className="ft-select-option-description">{option.description}</div>
      )}
    </div>
  )
}
