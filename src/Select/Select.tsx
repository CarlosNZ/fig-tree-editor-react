import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevron } from 'json-edit-react'
import { OptionGroup, SelectOption, type SelectProps } from './types'
import { DropdownMenu } from './Menu'

export function Select<T>({
  options = [],
  optionGroups,
  selected,
  setSelected,
  search = false,
  placeholder,
  className,
  border,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const currentSelectionRef = useRef<HTMLDivElement>(null)

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

  // Un-highlights row when user types
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [searchText])

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

  const matchOption = useCallback(
    <T,>(option: SelectOption<T>, group: OptionGroup<T> | null = null) => {
      const searchTextLower = searchText.toLowerCase()
      if (group && group.label.toLowerCase().includes(searchTextLower)) return true
      return option.label.toLowerCase().includes(searchTextLower)
    },
    [searchText]
  )

  const handleOpen = () => {
    setOpen(true)
  }

  const handleClose = () => {
    setOpen(false)
    setSearchText('')
    setHighlightedIndex(-1)
  }

  const handleSelect = (option: SelectOption<T>) => {
    setSelected(option)
    handleClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < allVisibleOptions.length - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        e.stopPropagation()
        if (highlightedIndex >= 0 && highlightedIndex < allVisibleOptions.length) {
          handleSelect(allVisibleOptions[highlightedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        handleClose()
        break
    }
  }

  const hasGroups = !!optionGroups

  const filteredGroups = hasGroups
    ? optionGroups
        .map((group) => ({
          ...group,
          options: group.options.filter((opt) => matchOption(opt, group)),
        }))
        .filter((group) => group.options.length > 0)
    : []

  const filteredOptions = !hasGroups ? options.filter((opt) => matchOption(opt)) : []

  const allVisibleOptions = optionGroups
    ? filteredGroups.flatMap((group) => group.options)
    : filteredOptions

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
          <div className="ft-select-trigger ft-select-input" onClick={handleOpen} tabIndex={0}>
            {selected ?? <span className="ft-select-placeholder">{placeholder}</span>}
            <IconChevron
              size="1em"
              style={{ position: 'absolute', right: '0.4em', color: '#A5A5A5' }}
            />
          </div>
        ) : (
          <>
            <input
              ref={searchInputRef}
              type="text"
              className="ft-select-input"
              placeholder={placeholder}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={handleKeyDown}
              {...additionalInputProps}
            />
            <DropdownMenu
              optionsRef={optionsRef}
              currentSelectionRef={currentSelectionRef}
              optionGroups={hasGroups ? filteredGroups : undefined}
              options={filteredOptions}
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
