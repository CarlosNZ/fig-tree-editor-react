import React, { useEffect, useRef, useState } from 'react'
import { type OptionGroup, type SelectOption, type SelectProps } from './types'
import { Icon } from '../Icons'
import { strings } from '../strings'
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
  emptyText,
}: SelectProps<T>) {
  const [open, setOpen] = useState(startOpen)
  const [searchText, setSearchText] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const currentSelectionRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  // The closed trigger's width, which the open field keeps, so the controls
  // beside it don't move. A list that starts open has none to keep.
  const [openWidth, setOpenWidth] = useState<number | undefined>(undefined)

  const groups = visibleGroups(optionGroups ?? [{ label: '', options }], searchText, !optionGroups)
  const entries = groups.flatMap((group) => group.entries)
  const firstChoosable = entries.find(({ option }) => !option.disabled)?.index ?? -1
  const indexOf = (value: string | null | undefined) =>
    entries.find(({ option }) => !option.disabled && option.value === value)?.index ?? -1

  const [highlightedIndex, setHighlightedIndex] = useState(() =>
    startOpen ? indexOf(highlighted) : -1
  )

  useEffect(() => {
    // Anywhere outside the whole select, so its own trigger or search field
    // doesn't count
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleClose()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Puts focus on the search field when the list opens, or on the trigger,
  // which takes the keys, where there's no search
  useEffect(() => {
    if (open) {
      ;(searchInputRef.current ?? triggerRef.current)?.focus()
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
    const width = triggerRef.current?.getBoundingClientRect().width
    setOpenWidth(width === 0 ? undefined : width)
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
  const label = selectedLabel ?? selected

  // A label too long for the trigger ends in "…", so its whole text shows on
  // hover
  const titleIfCut = (e: React.MouseEvent<HTMLDivElement>) => {
    const text = e.currentTarget.querySelector<HTMLElement>('.ft-select-trigger-label')
    e.currentTarget.title = text && text.scrollWidth > text.clientWidth ? (label ?? '') : ''
  }

  return (
    <div className={`ft-select-container ${className}`} ref={containerRef}>
      <div className="ft-select-select-wrapper">
        {open && search ? (
          <input
            ref={searchInputRef}
            type="text"
            className="ft-select-input"
            placeholder={placeholder}
            value={searchText}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{ width: openWidth }}
          />
        ) : (
          // Without search, the trigger stays while the list is open, showing
          // the current value, and takes the keys
          <div
            ref={triggerRef}
            className={`ft-select-trigger ft-select-input${open ? ' ft-select-open' : ''}`}
            onClick={open ? handleClose : handleOpen}
            onKeyDown={open ? handleKeyDown : handleTriggerKeyDown}
            onMouseEnter={titleIfCut}
            tabIndex={0}
            aria-expanded={open}
          >
            <span className="ft-select-trigger-label">
              {label ?? <span className="ft-select-placeholder">{placeholder}</span>}
            </span>
            <span className="ft-select-chevron" aria-hidden="true">
              <Icon name="collection" scale={0.7} />
            </span>
          </div>
        )}
        {open && (
          <DropdownMenu
            optionsRef={optionsRef}
            currentSelectionRef={currentSelectionRef}
            groups={groups}
            selected={selected}
            handleSelect={handleSelect}
            highlightedIndex={highlightedIndex}
            border={border}
            search={search}
            emptyText={
              emptyText !== undefined && allOptions(optionGroups, options).length === 0
                ? emptyText
                : strings.FT_SELECT_NO_RESULTS
            }
          />
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
