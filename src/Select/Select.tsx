import React, { useEffect, useRef, useState } from 'react'
import { type OptionGroup, type SelectOption, type SelectProps } from './types'
import { DropdownMenu, type MenuGroup, type MenuEntry } from './Menu'

// A searchable dropdown. Every option shown has one index, in display order,
// which highlighting, the arrow keys, Enter and scrolling all use; group
// headings are labels only. Nothing is highlighted when the list opens,
// unless `highlighted` names an option, and after each keystroke the first
// match that can be chosen is.
export function Select<T>({
  options = [],
  optionGroups,
  selected,
  setSelected,
  search = false,
  placeholder,
  className,
  border,
  startOpen = false,
  highlighted,
}: SelectProps<T>) {
  const [open, setOpen] = useState(startOpen)
  const [searchText, setSearchText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const currentSelectionRef = useRef<HTMLDivElement>(null)

  const groups = visibleGroups(optionGroups ?? [{ label: '', options }], searchText, !optionGroups)
  const entries = groups.flatMap((group) => group.entries)
  const firstChoosable = entries.find(({ option }) => !option.disabled)?.index ?? -1
  const indexOf = (value: string | null | undefined) =>
    entries.find(({ option }) => !option.disabled && option.value === value)?.index ?? -1

  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    startOpen ? indexOf(highlighted) : -1
  )

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current?.contains(event.target as Node)) {
        handleClose()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Puts focus on text input when drop-down opens up
  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus()
      currentSelectionRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [open])

  // Keeps the highlighted item in view as user goes up and down list
  useEffect(() => {
    if (highlightedIndex >= 0 && optionsRef.current) {
      const highlightedElement = optionsRef.current?.querySelector(
        `[data-index="${highlightedIndex}"]`
      )
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightedIndex])

  const handleOpen = () => {
    setOpen(true)
    setHighlightedIndex(indexOf(highlighted))
  }

  const handleClose = () => {
    setOpen(false)
    setSearchText('')
    setHighlightedIndex(-1)
  }

  const handleSelect = (option: SelectOption<T>) => {
    if (option.disabled) return
    setSelected(option)
    handleClose()
  }

  const handleSearch = (text: string) => {
    setSearchText(text)
    const matches = visibleGroups(optionGroups ?? [{ label: '', options }], text, !optionGroups)
    const first = matches.flatMap((group) => group.entries).find(({ option }) => !option.disabled)
    setHighlightedIndex(text === '' || !first ? -1 : first.index)
  }

  // The next option that can be chosen, from `index` in `step`'s direction
  const step = (index: number, direction: 1 | -1) => {
    const choosable = entries.filter(({ option }) => !option.disabled).map((entry) => entry.index)
    if (index < 0) return direction === 1 ? firstChoosable : -1
    const next =
      direction === 1
        ? choosable.find((i) => i > index)
        : [...choosable].reverse().find((i) => i < index)
    return next ?? index
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => step(prev, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => step(prev, -1))
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (entries[highlightedIndex]) handleSelect(entries[highlightedIndex].option)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        handleClose()
        break
    }
  }

  // The closed trigger opens from the keyboard as from a click, so a key
  // meant for it never reaches whatever surrounds it
  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      handleOpen()
    }
  }

  const selectedLabel = allOptions(optionGroups, options).find(
    (option) => option.value === selected
  )?.label

  // Some additional props for the input area when "search" is disabled
  const additionalInputProps = search
    ? {}
    : {
        className: 'ft-select-input ft-select-placeholder',
        value: '',
        onChange: () => {},
        style: { cursor: 'default' },
      }

  return (
    <div className={`ft-select-container ${className}`} ref={containerRef}>
      <div className="ft-select-select-wrapper">
        {!open ? (
          <div
            className="ft-select-trigger ft-select-input"
            onClick={handleOpen}
            onKeyDown={handleTriggerKeyDown}
            tabIndex={0}
          >
            {selectedLabel ?? selected ?? (
              <span className="ft-select-placeholder">{placeholder}</span>
            )}
          </div>
        ) : (
          <>
            <input
              ref={searchInputRef}
              type="text"
              className="ft-select-input"
              placeholder={placeholder}
              value={searchText}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              {...additionalInputProps}
            />
            <DropdownMenu
              optionsRef={optionsRef}
              currentSelectionRef={currentSelectionRef}
              groups={groups}
              selected={selected}
              handleSelect={handleSelect}
              highlightedIndex={highlightedIndex}
              border={border}
              search={search}
            />
          </>
        )}
      </div>
    </div>
  )
}

const allOptions = <T,>(groups: OptionGroup<T>[] | undefined, options: SelectOption<T>[]) =>
  groups ? groups.flatMap((group) => group.options) : options

// The groups with the options that match the search text, indexed in display
// order. An option matches when the text, lowercased, is part of its label,
// its keywords or its group's label. Groups left empty are dropped.
const visibleGroups = <T,>(
  groups: OptionGroup<T>[],
  text: string,
  ungrouped: boolean
): MenuGroup<T>[] => {
  const lower = text.toLowerCase()
  const includes = (value?: string) => value?.toLowerCase().includes(lower) ?? false
  let index = 0
  return groups
    .map((group) => ({
      label: ungrouped ? undefined : group.label,
      description: group.description,
      entries: group.options
        .filter(
          (option) => includes(group.label) || includes(option.label) || includes(option.keywords)
        )
        .map((option): MenuEntry<T> => ({ option, index: index++ })),
    }))
    .filter((group) => group.entries.length > 0)
}
