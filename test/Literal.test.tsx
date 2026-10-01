import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { strings } from '../src/strings'
import { figTree } from './fixtures'
import { keyLabel } from './queries'

const editor = (expression: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) =>
  render(
    <FigTreeEditor
      figTree={figTree}
      expression={expression}
      setExpression={vi.fn()}
      collapse={false}
      {...props}
    />
  )

// A host holding the expression, so each commit comes back as the editor's
// next expression, in StrictMode
const host = (initial: unknown) => {
  const written: unknown[] = []
  const Host = () => {
    const [expression, setExpression] = useState(initial)
    return (
      <FigTreeEditor
        figTree={figTree}
        expression={expression}
        setExpression={(next) => {
          written.push(next)
          setExpression(next)
        }}
        collapse={false}
      />
    )
  }
  const { container } = render(<Host />, { wrapper: StrictMode })
  return { container, written, user: userEvent.setup() }
}
const latest = (written: unknown[]) => written[written.length - 1]

const displayBars = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('.ft-display-bar'),
]

describe('a literal', () => {
  it("shows its name and display data, and the editor's description", () => {
    for (const [expression, name] of [
      [{ operator: 'literal', value: { $plus: [1] } }, 'literal'],
      [{ $literal: { $plus: [1] } }, '$literal'],
    ] as const) {
      const { container, unmount } = editor(expression)
      const [bar] = displayBars(container)
      expect(within(bar).getByRole('button', { name })).toBeInTheDocument()
      expect(within(bar).getByRole('link', { name: 'Literal' })).toBeInTheDocument()
      expect(within(bar).getByRole('tooltip', { hidden: true })).toHaveTextContent(
        strings.FT_LITERAL_DESCRIPTION
      )
      unmount()
    }
  })

  it('shows its content as plain data, whatever it holds', () => {
    const { container } = editor({
      operator: 'literal',
      value: { $plus: ['$data.x'], vars: { a: 1 }, '//': 'Data' },
    })
    expect(displayBars(container)).toHaveLength(1)
    expect(container.querySelector('.ft-reference')).not.toBeInTheDocument()
    expect(container.querySelector('.ft-comment')).not.toBeInTheDocument()
    expect(screen.getByText('"$data.x"')).toBeInTheDocument()
    expect(keyLabel('//')).toBeInTheDocument()
  })

  it("puts a shorthand's single plain value on the button's line", () => {
    const { container } = editor({ $literal: 'x' })
    expect(within(displayBars(container)[0]).getByText('"x"')).toBeInTheDocument()
  })

  it('offers only a comment in its toolbar, and has no ＋ of its own', async () => {
    const { written, user } = host({ operator: 'literal', value: { a: 1 } })
    // The content's own ＋ is the only one
    const adds = screen.getAllByRole('button', { name: 'Add' })
    expect(adds).toHaveLength(1)
    expect(keyLabel('value').closest('.jer-collection-header-row')).toContainElement(adds[0])
    await user.click(screen.getByRole('button', { name: 'Open toolbar' }))
    await user.click(screen.getByText('Add parameter'))
    const entries = [...document.querySelectorAll('.ft-select-option')].map(
      (entry) => entry.textContent
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatch(/^\/\//)
    await user.click(document.querySelector<HTMLElement>('.ft-select-option')!)
    expect(latest(written)).toEqual({
      '//': strings.FT_NEW_COMMENT,
      operator: 'literal',
      value: { a: 1 },
    })
  })

  it("won't delete its content", () => {
    const { container } = editor({ operator: 'literal', value: 'x', '//': 'Note' })
    const deletes = screen.queryAllByRole('button', { name: 'Delete' })
    // The comment's ✕ only
    expect(deletes).toHaveLength(1)
    expect(container.querySelector('.ft-comment')!.closest('.jer-value-main-row')).toContainElement(
      deletes[0]
    )
  })

  it("offers json-edit-react's types on its content, and nothing evaluated", async () => {
    const { user } = host({ operator: 'literal', value: 'x' })
    await user.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!)
    const types = [...screen.getByRole('combobox').querySelectorAll('option')].map(
      ({ textContent }) => textContent
    )
    expect(types).toEqual(['string', 'number', 'boolean', 'null', 'object', 'array'])
  })

  it('converts between its forms', () => {
    const { written } = host({ x: { operator: 'literal', value: { $plus: [1] } } })
    fireEvent.click(screen.getByRole('button', { name: 'To shorthand' }))
    expect(latest(written)).toEqual({ x: { $literal: { $plus: [1] } } })
    fireEvent.click(screen.getByRole('button', { name: 'To full' }))
    expect(latest(written)).toEqual({ x: { operator: 'literal', value: { $plus: [1] } } })
  })

  it('summarises itself when collapsed', () => {
    const collapseAll = ({ level }: { level: number }) => level > 0
    const { container } = editor(
      { full: { operator: 'literal', value: 1 }, short: { $literal: { a: 1 } } },
      { collapse: collapseAll }
    )
    const summaries = [...container.querySelectorAll('.jer-collection-item-count.jer-visible')].map(
      ({ textContent }) => textContent
    )
    expect(summaries).toEqual(['Literal', 'Shorthand: $literal'])
  })
})

describe('switching to a literal', () => {
  const openPicker = async (user: ReturnType<typeof userEvent.setup>, current: string) => {
    await user.click(screen.getAllByRole('button', { name: 'Open toolbar' })[0])
    await user.click(screen.getByText(current, { selector: '.ft-select-container *' }))
  }

  it('quotes the node, its comment included, and keeps the toolbar open', async () => {
    const node = { '//': 'Sums', operator: 'plus', values: [1, 2], fallback: 0 }
    const { container, written, user } = host(node)
    await openPicker(user, 'Plus (+)')
    await user.keyboard('literal{Enter}')
    expect(latest(written)).toEqual({ operator: 'literal', value: node })
    expect(container.querySelector('.ft-toolbar')).toBeInTheDocument()
    // ✗ restores the node from before the session
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(latest(written)).toEqual(node)
  })

  it('quotes a broken node, which may be data read as one', async () => {
    const data = { operator: 'admin', name: 'Ada' }
    const { written, user } = host(data)
    await user.click(screen.getByRole('button', { name: 'Open toolbar' }))
    await user.keyboard('literal{Enter}')
    expect(latest(written)).toEqual({ operator: 'literal', value: data })
  })

  it('starts a new node from the seed, with nothing to quote', async () => {
    const { written, user } = host({ operator: 'round', value: 3 })
    await user.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!)
    await user.selectOptions(screen.getByRole('combobox'), 'Operator')
    await user.keyboard('literal{Enter}')
    expect(latest(written)).toEqual({
      operator: 'round',
      value: { operator: 'literal', value: 'No content inside a literal node is evaluated' },
    })
  })

  it('switches away as from any operator, keeping the toolbar open', async () => {
    const { container, written, user } = host({ operator: 'literal', value: 3.5 })
    await openPicker(user, 'Literal')
    await user.keyboard('round{Enter}')
    expect(latest(written)).toEqual({ operator: 'round', value: 3.5 })
    expect(container.querySelector('.ft-toolbar')).toBeInTheDocument()
  })
})
