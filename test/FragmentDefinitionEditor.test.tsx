import { fireEvent, render, screen, within } from '@testing-library/react'
import { type FragmentDefinition } from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { describe, expect, it, vi } from 'vitest'
import { FragmentDefinitionEditor } from '../src'
import { figTree } from './fixtures'
import { keyLabel, keyLabels } from './queries'

const definition: FragmentDefinition = {
  expression: { operator: 'plus', values: ['Hello, ', '$params.name'] },
  parameters: { name: { type: 'string' } },
  listing: { description: 'Greets someone by name' },
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
    expect(options.filter((value) => value !== '')).toEqual(['metadata'])
    fireEvent.change(select, { target: { value: 'metadata' } })
    expect(setDefinition).toHaveBeenCalledExactlyOnceWith({ ...definition, metadata: {} })
  })

  it("offers the listing the fields it doesn't have, starting samples for the required parameters", () => {
    const setDefinition = vi.fn()
    render(
      <FragmentDefinitionEditor
        figTree={figTree}
        definition={definition}
        setDefinition={setDefinition}
      />
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' })[1])
    const select = screen.getByRole('combobox')
    const options = [...select.querySelectorAll('option')].map(({ value }) => value)
    expect(options.filter((value) => value !== '')).toEqual([
      'displayName',
      'parameterDescriptions',
      'docUrl',
      'colors',
      'seeds',
      'samples',
      'metadata',
    ])
    fireEvent.change(select, { target: { value: 'samples' } })
    expect(setDefinition).toHaveBeenCalledExactlyOnceWith({
      ...definition,
      listing: { ...definition.listing, samples: { name: typeSeeds.string } },
    })
  })

  it("renames a parameter's sample, seed and description with it", () => {
    const setDefinition = vi.fn()
    const withEntries = {
      ...definition,
      listing: {
        ...definition.listing,
        parameterDescriptions: { name: 'Who to greet' },
        seeds: { name: 'World' },
        samples: { name: 'Ada' },
      },
    }
    render(
      <FragmentDefinitionEditor
        figTree={figTree}
        definition={withEntries}
        setDefinition={setDefinition}
      />
    )
    // The declaration's, after the listing's entries for the parameter
    fireEvent.doubleClick(keyLabels('name').at(-1)!)
    const input = screen.getByDisplayValue('name')
    fireEvent.change(input, { target: { value: 'who' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // TO-DO: exactly once, when json-edit-react applies a synchronous
    // `{ data }` from `onUpdate` in one write, not after the plain change
    expect(setDefinition).toHaveBeenLastCalledWith({
      ...withEntries,
      parameters: { who: { type: 'string' } },
      listing: {
        ...definition.listing,
        parameterDescriptions: { who: 'Who to greet' },
        seeds: { who: 'World' },
        samples: { who: 'Ada' },
      },
    })
  })

  describe('a whole definition pasted over the root', () => {
    const pasted: FragmentDefinition = {
      expression: { $plus: ['$params.a', '$params.b'] },
      parameters: { a: { type: 'number' }, b: { type: 'number', default: 1 } },
      listing: { samples: { a: 2 } },
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
        listing: { seeds: { formal: false }, samples: { name: 'Ada', formal: true } },
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
        listing: { seeds: {}, samples: { name: 'Ada' } },
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
      listing: { colors: { background: '#e8e0f8', text: '#4b2a8a' } },
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

  describe("the root's name button", () => {
    const withListing: FragmentDefinition = {
      ...definition,
      listing: { displayName: 'Greeting', colors: { background: 'rgb(1, 2, 3)', text: 'white' } },
    }
    const renderNamed = (fragmentName: string | undefined, setFragmentName = vi.fn()) => {
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={withListing}
          setDefinition={vi.fn()}
          fragmentName={fragmentName}
          setFragmentName={setFragmentName}
        />
      )
      return setFragmentName
    }

    it("shows the name in the fragment's colours, with its display name, for the root's", () => {
      renderNamed('greeting')
      const button = screen.getByRole('button', { name: 'greeting' })
      expect(button).toHaveStyle({ backgroundColor: 'rgb(1, 2, 3)', color: 'rgb(255, 255, 255)' })
      expect(screen.getByText('Greeting')).toBeInTheDocument()
      expect(screen.queryByText('definition')).not.toBeInTheDocument()
    })

    it('invites a name while there is none', () => {
      renderNamed(undefined)
      expect(screen.getByRole('button', { name: 'Fragment — click to rename' })).toBeInTheDocument()
    })

    it('renames the fragment from an input that replaces it', () => {
      const setFragmentName = renderNamed('greeting')
      fireEvent.click(screen.getByRole('button', { name: 'greeting' }))
      const input = screen.getByRole('textbox', { name: 'Fragment name' })
      fireEvent.change(input, { target: { value: ' hello ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(setFragmentName).toHaveBeenCalledExactlyOnceWith('hello')
    })

    it('saves the name on leaving the input', () => {
      const setFragmentName = renderNamed('greeting')
      fireEvent.click(screen.getByRole('button', { name: 'greeting' }))
      const input = screen.getByRole('textbox', { name: 'Fragment name' })
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.blur(input)
      expect(setFragmentName).toHaveBeenCalledExactlyOnceWith('hello')
    })

    it('leaves the fragment unnamed where the name is cleared', () => {
      const setFragmentName = renderNamed('greeting')
      fireEvent.click(screen.getByRole('button', { name: 'greeting' }))
      const input = screen.getByRole('textbox', { name: 'Fragment name' })
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(setFragmentName).toHaveBeenCalledExactlyOnceWith(undefined)
    })

    it('keeps the name on Escape', () => {
      const setFragmentName = renderNamed('greeting')
      fireEvent.click(screen.getByRole('button', { name: 'greeting' }))
      const input = screen.getByRole('textbox', { name: 'Fragment name' })
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(setFragmentName).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'greeting' })).toBeInTheDocument()
    })

    it("doesn't collapse the root", () => {
      renderNamed('greeting')
      const chevron = screen.getAllByRole('button', { expanded: true })[0]
      fireEvent.click(screen.getByRole('button', { name: 'greeting' }))
      expect(chevron).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(screen.getByRole('textbox', { name: 'Fragment name' }))
      expect(chevron).toHaveAttribute('aria-expanded', 'true')
    })

    it("is a preview only without the host's setter", () => {
      render(
        <FragmentDefinitionEditor
          figTree={figTree}
          definition={withListing}
          setDefinition={vi.fn()}
          fragmentName="greeting"
        />
      )
      expect(screen.getByText('greeting')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'greeting' })).not.toBeInTheDocument()
    })
  })
})
