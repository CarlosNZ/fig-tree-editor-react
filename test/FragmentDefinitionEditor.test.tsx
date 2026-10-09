import { fireEvent, render, screen } from '@testing-library/react'
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
})
