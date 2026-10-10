import { fireEvent, render, screen, within } from '@testing-library/react'
import { type FragmentDefinition } from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { describe, expect, it, vi } from 'vitest'
import { FragmentDefinitionEditor } from '../src'
import { keyLabel } from './queries'

const definition: FragmentDefinition = {
  expression: { operator: 'plus', values: ['Hello, ', '$params.name'] },
  parameters: { name: { type: 'string' } },
  description: 'Greets someone by name',
}

describe('FragmentDefinitionEditor', () => {
  it('shows the definition without its body', () => {
    render(<FragmentDefinitionEditor definition={definition} setDefinition={vi.fn()} />)
    expect(screen.getByText('parameters')).toBeInTheDocument()
    expect(screen.getByText('"Greets someone by name"')).toBeInTheDocument()
    expect(screen.queryByText('expression')).not.toBeInTheDocument()
  })

  it("offers the root the fields it doesn't have, and writes a new one with the body kept", () => {
    const setDefinition = vi.fn()
    render(<FragmentDefinitionEditor definition={definition} setDefinition={setDefinition} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[0])
    const select = screen.getByRole('combobox')
    const options = [...select.querySelectorAll('option')].map(({ value }) => value)
    expect(options.filter((value) => value !== '')).toEqual(['samples', 'metadata'])
    fireEvent.change(select, { target: { value: 'samples' } })
    expect(setDefinition).toHaveBeenCalledExactlyOnceWith({
      ...definition,
      samples: { name: typeSeeds.string },
    })
  })

  it("renames a parameter's sample and seed with it", () => {
    const setDefinition = vi.fn()
    const withEntries = {
      ...definition,
      samples: { name: 'Ada' },
      metadata: { seeds: { name: 'World' } },
    }
    render(<FragmentDefinitionEditor definition={withEntries} setDefinition={setDefinition} />)
    fireEvent.doubleClick(keyLabel('name'))
    const input = screen.getByDisplayValue('name')
    fireEvent.change(input, { target: { value: 'who' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // TO-DO: exactly once, when json-edit-react applies a synchronous
    // `{ data }` from `onUpdate` in one write, not after the plain change
    expect(setDefinition).toHaveBeenLastCalledWith({
      ...withEntries,
      parameters: { who: { type: 'string' } },
      samples: { who: 'Ada' },
      metadata: { seeds: { who: 'World' } },
    })
  })

  describe('its own components', () => {
    const typed: FragmentDefinition = {
      expression: null,
      parameters: {
        name: { type: 'string' },
        nickname: { type: ['string', 'null'] },
        mood: { type: { literal: ['happy', 'sad'] } },
      },
      metadata: { backgroundColor: '#e8e0f8' },
    }

    const chipTexts = () =>
      [...document.querySelectorAll('.jer-chip')].map((chip) => chip.textContent)

    it('draws a union and a literal union as chips, and a colour with its swatch', () => {
      const { container } = render(
        <FragmentDefinitionEditor definition={typed} setDefinition={vi.fn()} />
      )
      expect(chipTexts()).toEqual(['string', 'null', 'happy', 'sad'])
      expect(screen.getByText('"string"')).toBeInTheDocument()
      const swatches = [...container.querySelectorAll<HTMLElement>('div')].filter(
        (element) => element.style.backgroundColor === 'rgb(232, 224, 248)'
      )
      expect(swatches).toHaveLength(1)
    })

    it('writes a chip removed from a union', () => {
      const setDefinition = vi.fn()
      render(<FragmentDefinitionEditor definition={typed} setDefinition={setDefinition} />)
      // Shown on hover, so hidden by Chips' stylesheet until then
      fireEvent.click(screen.getByLabelText('Remove null'))
      expect(setDefinition).toHaveBeenLastCalledWith({
        ...typed,
        parameters: { ...typed.parameters, nickname: { type: ['string'] } },
      })
    })

    it('switches a union to a literal union, through the type selector', () => {
      const setDefinition = vi.fn()
      render(<FragmentDefinitionEditor definition={typed} setDefinition={setDefinition} />)
      const row = document.querySelector('.jer-chips')?.closest('.jer-value-main-row')
      fireEvent.click(
        within(row as HTMLElement).getByRole('button', { name: 'Edit', hidden: true })
      )
      const typeSelect = screen
        .getAllByRole('combobox')
        .find((select) => within(select).queryByRole('option', { name: 'Literal' }))
      fireEvent.change(typeSelect!, { target: { value: 'Literal' } })
      expect(setDefinition).toHaveBeenLastCalledWith({
        ...typed,
        parameters: { ...typed.parameters, nickname: { type: { literal: [] } } },
      })
    })

    it('writes a chip added to a literal union inside it', () => {
      const setDefinition = vi.fn()
      render(<FragmentDefinitionEditor definition={typed} setDefinition={setDefinition} />)
      fireEvent.click(screen.getAllByRole('button', { name: 'Add chip' })[1])
      const input = screen.getByPlaceholderText('Add…')
      fireEvent.change(input, { target: { value: 'calm' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(setDefinition).toHaveBeenLastCalledWith({
        ...typed,
        parameters: { ...typed.parameters, mood: { type: { literal: ['happy', 'sad', 'calm'] } } },
      })
    })
  })
})
