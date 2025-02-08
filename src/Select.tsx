import React, { useCallback, useEffect, useRef, useState } from 'react'
import { IconChevron } from 'json-edit-react'

export interface SelectOption<T> {
  label: string
  value: T
}

export interface OptionGroup<T> {
  label: string
  value: T
  options: SelectOption<T>[]
}

interface SelectProps<T> {
  options?: SelectOption<T>[]
  optionGroups?: OptionGroup<T>[]
  selected: string | null
  setSelected: (selection: SelectOption<T>) => void
  search?: boolean
  placeholder?: string
  className: string
}

export function Select<T>({
  options = [],
  optionGroups,
  selected,
  setSelected,
  search = false,
  placeholder,
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)

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

  const filteredGroups = optionGroups
    ? optionGroups
        .map((group) => ({
          ...group,
          options: group.options.filter((opt) => matchOption(opt, group)),
        }))
        .filter((group) => group.options.length > 0)
    : []

  const filteredOptions = !optionGroups ? options.filter((opt) => matchOption(opt)) : []

  const allVisibleOptions = optionGroups
    ? filteredGroups.flatMap((group) => group.options)
    : filteredOptions

  const DropdownJSX =
    allVisibleOptions.length === 0 ? (
      <div className={`ft-select-option ft-select-no-options`} tabIndex={0}>
        No results
      </div>
    ) : optionGroups ? (
      filteredGroups.map((group, groupIndex) => (
        <div key={group.label}>
          <div
            className={`ft-select-group-label ${
              highlightedIndex === groupIndex ? 'ft-select-highlighted' : ''
            }`}
            onClick={() => {
              console.log('Click options')
              handleSelect(group)
            }}
          >
            {group.label}
          </div>
          {group.options.map((option, optionIndex) => {
            const index =
              filteredGroups.slice(0, groupIndex).reduce((acc, g) => acc + g.options.length, 0) +
              optionIndex

            return (
              <div
                key={option.label}
                className={`ft-select-option${
                  highlightedIndex === index ? ' ' + 'ft-select-highlighted' : ''
                }`}
                onClick={() => handleSelect(option)}
                data-index={index}
                tabIndex={0}
                style={search ? {} : { padding: '0.5em 0.75em' }}
              >
                {option.label}
              </div>
            )
          })}
        </div>
      ))
    ) : (
      filteredOptions.map((option, index) => (
        <div
          key={option.label}
          className={`ft-select-option${
            highlightedIndex === index ? ' ' + 'ft-select-highlighted' : ''
          }`}
          onClick={() => handleSelect(option)}
          data-index={index}
          tabIndex={0}
          style={search ? {} : { padding: '0.5em 0.75em' }}
        >
          {option.label}
        </div>
      ))
    )

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
            <div ref={optionsRef} className="ft-select-dropdown">
              {DropdownJSX}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
