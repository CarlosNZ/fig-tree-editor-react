import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { describe, expect, it, vi } from 'vitest'
import { FragmentSelect } from '../src'
import { strings } from '../src/strings'

const figTree = new FigTree({
  operators: coreOperators,
  fragments: {
    greet: {
      expression: 'Hello',
      description: 'Says hello',
      metadata: { displayName: 'Greeting' },
    },
    shout: { expression: 'HEY' },
  },
})

describe('FragmentSelect', () => {
  it('lists the registered fragments by display name, and picks one by name', async () => {
    const onSelect = vi.fn()
    render(<FragmentSelect figTree={figTree} selected={null} onSelect={onSelect} />)
    const user = userEvent.setup()
    await user.click(screen.getByText(strings.FT_FRAGMENT_SELECT_PLACEHOLDER))
    expect(screen.getByText('Says hello')).toBeInTheDocument()
    expect(screen.getByText('shout')).toBeInTheDocument()

    await user.click(screen.getByText('Greeting'))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('greet')
  })

  it('shows the fragment being edited', () => {
    render(<FragmentSelect figTree={figTree} selected="greet" onSelect={vi.fn()} />)
    expect(screen.getByText('Greeting')).toBeInTheDocument()
  })
})
