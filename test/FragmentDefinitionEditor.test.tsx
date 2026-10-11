import { fireEvent, render, screen, within } from '@testing-library/react'
import { type FragmentDefinition } from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { describe, expect, it, vi } from 'vitest'
import { FragmentDefinitionEditor } from '../src'
import { figTree } from './fixtures'
import { keyLabel } from './queries'

const definition: FragmentDefinition = {
  expression: { operator: 'plus', values: ['Hello, ', '$params.name'] },
  parameters: { name: { type: 'string' } },
  description: 'Greets someone by name',
}

describe('FragmentDefinitionEditor', () => {
  it('shows the definition without its body', () => {
    render(
      <FragmentDefinitionEditor figTree={figTree} definition={definition} setDefinition={vi.fn()} />
    )
    expect(screen.getByText('parameters')).toBeInTheDocument()
    expect(screen.getByText('"Greets someone by name"')).toBeInTheDocument()
    expect(screen.queryByText('expression')).not.toBeInTheDocument()
  })

  it("offers the root the fields it doesn't have, and writes a new one with the body kept", () => {
    const setDefinition = vi.fn()
    render(
      <FragmentDefinitionEditor
        figTree={figTree}
        definition={definition}
        setDefinition={setDefinition}
      />
    )
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
    render(
      <FragmentDefinitionEditor
        figTree={figTree}
        definition={withEntries}
        setDefinition={setDefinition}
      />
    )
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

  describe('a whole definition pasted over the root', () => {
    const pasted: FragmentDefinition = {
      expression: { $plus: ['$params.a', '$params.b'] },
      parameters: { a: { type: 'number' }, b: { type: 'number', default: 1 } },
      samples: { a: 2 },
    }
    const paste = (value: unknown) => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      fireEvent.change(screen.getByRole('textbox'), { target: { value: JSON.stringify(value) } })
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    }

    it('replaces the definition, its body included', () => {
      const setDefinition = vi.fn()
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={definition}
          setDefinition={setDefinition}
        />
      )
      paste(pasted)
      expect(setDefinition).toHaveBeenLastCalledWith(pasted)
    })

    it('keeps the body where the fields alone are pasted', () => {
      const setDefinition = vi.fn()
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={definition}
          setDefinition={setDefinition}
        />
      )
      const { expression: _body, ...fields } = pasted
      paste(fields)
      expect(setDefinition).toHaveBeenLastCalledWith({
        ...fields,
        expression: definition.expression,
      })
    })

    it('refuses one out of shape, writing nothing', () => {
      const setDefinition = vi.fn()
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={definition}
          setDefinition={setDefinition}
        />
      )
      paste({ ...pasted, nmae: 'typo' })
      expect(setDefinition).not.toHaveBeenCalled()
    })
  })

  describe("the definition's issues", () => {
    const declared: FragmentDefinition = {
      expression: { $plus: ['$params.x', '$params.undeclared'] },
      parameters: { x: { type: 'number', required: true, default: 1 } },
    }

    it('lists each issue outside the body beneath the tree, at its path', () => {
      render(
        <FragmentDefinitionEditor figTree={figTree} definition={declared} setDefinition={vi.fn()} />
      )
      const list = screen.getByRole('list')
      expect(within(list).getAllByRole('listitem')).toHaveLength(1)
      expect(within(list).getByText('parameters.x.default')).toBeInTheDocument()
      expect(
        within(list).getByText(/declared required and also declares a default/)
      ).toBeInTheDocument()
    })

    it('tints the row an issue marks', () => {
      render(
        <FragmentDefinitionEditor figTree={figTree} definition={declared} setDefinition={vi.fn()} />
      )
      const row = keyLabel('default').closest<HTMLElement>('.jer-value-main-row')
      expect(row?.style.boxShadow).toContain('inset')
      const other = keyLabel('type').closest<HTMLElement>('.jer-value-main-row')
      expect(other?.style.boxShadow).toBe('')
    })

    it('warns of a declared parameter the body never reads, with a fix to remove it', () => {
      const setDefinition = vi.fn()
      const unread: FragmentDefinition = {
        expression: '$params.name',
        parameters: { name: { type: 'string' }, formal: { type: 'boolean' } },
        samples: { name: 'Ada', formal: true },
        metadata: { seeds: { formal: false } },
      }
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={unread}
          setDefinition={setDefinition}
        />
      )
      const list = screen.getByRole('list')
      expect(within(list).getByText('parameters.formal')).toBeInTheDocument()
      expect(within(list).getByText("The body never reads 'formal'")).toBeInTheDocument()
      fireEvent.click(within(list).getByRole('button', { name: 'Remove' }))
      expect(setDefinition).toHaveBeenCalledExactlyOnceWith({
        expression: '$params.name',
        parameters: { name: { type: 'string' } },
        samples: { name: 'Ada' },
        metadata: { seeds: {} },
      })
    })

    it('shows no messages area for a definition that registers', () => {
      const { container } = render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={definition}
          setDefinition={vi.fn()}
        />
      )
      expect(container.querySelector('.ft-message-container')).toBeNull()
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
        <FragmentDefinitionEditor figTree={figTree} definition={typed} setDefinition={vi.fn()} />
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
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={typed}
          setDefinition={setDefinition}
        />
      )
      // Shown on hover, so hidden by Chips' stylesheet until then
      fireEvent.click(screen.getByLabelText('Remove null'))
      expect(setDefinition).toHaveBeenLastCalledWith({
        ...typed,
        parameters: { ...typed.parameters, nickname: { type: ['string'] } },
      })
    })

    it('switches a union to a literal union, through the type selector', () => {
      const setDefinition = vi.fn()
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={typed}
          setDefinition={setDefinition}
        />
      )
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
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={typed}
          setDefinition={setDefinition}
        />
      )
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
