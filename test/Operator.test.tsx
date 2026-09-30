import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { figTree } from './fixtures'

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

const displayBar = (container: HTMLElement, index = 0) =>
  container.querySelectorAll<HTMLElement>('.ft-display-bar')[index]

// A host holding the expression, so each commit comes back as the editor's
// next expression
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
  const { container } = render(<Host />)
  return { container, written, user: userEvent.setup() }
}
const latest = (written: unknown[]) => written[written.length - 1]

describe('the operator node', () => {
  it('shows the name as written on its button, and the display name', () => {
    const { container } = editor({ operator: 'plus', values: [1, 2] })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'plus' })).toBeInTheDocument()
    expect(bar.getByRole('link', { name: 'Plus (+)' })).toHaveAttribute(
      'href',
      'https://github.com/CarlosNZ/fig-tree-evaluator'
    )
  })

  it('shows an alias as written', () => {
    const { container } = editor({ operator: '+', values: [1, 2] })
    expect(within(displayBar(container)).getByRole('button', { name: '+' })).toBeInTheDocument()
  })

  it('shows the description on hover', () => {
    const { container } = editor({ operator: 'plus', values: [1, 2] })
    // The stylesheet hides the card until hovered
    expect(within(displayBar(container)).getByRole('tooltip', { hidden: true })).toHaveTextContent(
      /^Add numbers/
    )
  })

  it('drops its operator row, and keeps the others', () => {
    editor({ operator: 'plus', values: [1, 2], fallback: 0 })
    expect(screen.queryByText('operator')).not.toBeInTheDocument()
    expect(screen.getByText('values')).toBeInTheDocument()
    expect(screen.getByText('fallback')).toBeInTheDocument()
  })

  it('renders nested nodes, and one in a shorthand payload', () => {
    const { container } = editor({
      operator: 'if',
      condition: { operator: 'greaterThan', values: [2, 1] },
      then: { $not: { operator: 'and', values: [true] } },
      else: 'x',
    })
    const names = [...container.querySelectorAll('.ft-display-bar .ft-name')].map(
      (name) => name.textContent
    )
    expect(names).toEqual(['if', 'greaterThan', 'and'])
  })

  it('shows a host operator by its name, with no link when it has no docUrl', () => {
    const { container } = editor({ operator: 'reverse', value: 'abc' })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'reverse' })).toBeInTheDocument()
    expect(bar.getByText('reverse', { selector: '.ft-display-name' })).toBeInTheDocument()
    expect(bar.queryByRole('link')).not.toBeInTheDocument()
  })

  it("takes the host's display overrides", () => {
    const { container } = editor(
      { operator: 'plus', values: [1, 2] },
      { operatorHints: { plus: { displayName: 'Add', docUrl: 'https://example.com/add' } } }
    )
    expect(within(displayBar(container)).getByRole('link', { name: 'Add' })).toHaveAttribute(
      'href',
      'https://example.com/add'
    )
  })

  describe('when broken', () => {
    it('shows an unknown name as an error, with the message and no Evaluate button', () => {
      const { container } = editor({ operator: 'plsu', values: [1] })
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button', { name: 'plsu' })).not.toBeInTheDocument()
      expect(bar.getByText('plsu')).toHaveStyle({ color: 'rgb(192, 57, 43)' })
      expect(bar.getByText(/names no registered operator/)).toBeInTheDocument()
    })

    it('shows "invalid node" for a name that is not a string', () => {
      const { container } = editor({ operator: 42 })
      expect(within(displayBar(container)).getByText('invalid node')).toBeInTheDocument()
    })

    it("takes the host's error colour", () => {
      const { container } = editor({ operator: 'plsu' }, { editorTheme: { error: 'purple' } })
      expect(within(displayBar(container)).getByText('plsu').parentElement).toHaveStyle({
        color: 'rgb(128, 0, 128)',
      })
    })

    it('is not broken when it is only missing a parameter', () => {
      const { container } = editor({ operator: 'if', condition: true })
      expect(within(displayBar(container)).getByRole('button', { name: 'if' })).toBeInTheDocument()
    })
  })

  describe('collapsed', () => {
    it('summarises itself by its name as written', () => {
      editor({ total: { operator: '*', values: [2, 3] } }, { collapse: 1 })
      expect(screen.getByText('Operator: *')).toBeInTheDocument()
    })

    it("uses the host's text where the editor has none", () => {
      editor(
        { total: { operator: 'plus', values: [1] }, list: [1, 2] },
        { collapse: 1, customText: { ITEMS_MULTIPLE: () => 'many' } }
      )
      expect(screen.getByText('Operator: plus')).toBeInTheDocument()
      expect(screen.getByText('list').closest('.jer-collection-header-row')).toHaveTextContent(
        'many'
      )
    })
  })

  describe('editing', () => {
    const node = { total: { operator: 'plus', values: [1, 2] } }
    const pencil = () => screen.getByRole('button', { name: 'Open toolbar' })
    const toolbar = (container: HTMLElement) => container.querySelector('.ft-toolbar')

    it('opens the toolbar from the pencil, with the picker closed on the current operator', () => {
      const { container } = editor(node)
      fireEvent.click(pencil())
      expect(within(toolbar(container) as HTMLElement).getByText('Plus (+)')).toBeInTheDocument()
      expect(container.querySelector('.ft-select-dropdown')).toBeNull()
      expect(displayBar(container)).toBeUndefined()
      // The rows stay beneath it
      expect(screen.getByText('values')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(toolbar(container)).toBeNull()
      expect(displayBar(container)).toBeInTheDocument()
    })

    it("shows json-edit-react's raw-JSON editor alone from its ✎", () => {
      const { container } = editor(node)
      // json-edit-react's ✎ on the node's row, after the root's
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
      expect(container.querySelector('.ft-node textarea')).toBeInTheDocument()
      expect(displayBar(container)).toBeUndefined()
      expect(toolbar(container)).toBeNull()
    })

    it('offers the pencil on a broken node, and none where editing is not allowed', () => {
      editor({ operator: 'plsu', values: [1] })
      expect(pencil()).toBeInTheDocument()
      const { container } = editor(node, { allowEdit: false })
      expect(
        within(displayBar(container)).queryByRole('button', { name: 'Open toolbar' })
      ).toBeNull()
    })

    it("follows the host's keyboard controls", async () => {
      const { container } = editor(node, { keyboardControls: { cancel: 'q' } })
      fireEvent.click(pencil())
      // json-edit-react's listener attaches shortly after a session opens
      await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(toolbar(container)).toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'q' })
      await waitFor(() => expect(toolbar(container)).toBeNull())
    })
  })

  describe('the operator picker', () => {
    const openPicker = async (user: ReturnType<typeof userEvent.setup>, current: string) => {
      await user.click(screen.getByRole('button', { name: 'Open toolbar' }))
      await user.click(screen.getByText(current))
    }

    it('switches the operator, keeping what it declares, and keeps the toolbar open', async () => {
      const { container, written, user } = host({ operator: 'plus', values: [1, 2], fallback: 0 })
      await openPicker(user, 'Plus (+)')
      await user.keyboard('if{Enter}')
      expect(latest(written)).toEqual({
        operator: 'if',
        condition: expect.anything() as unknown,
        then: 'The condition is true',
        fallback: 0,
      })
      expect(container.querySelector('.ft-toolbar')).toBeInTheDocument()
      expect(screen.getByText('Conditional (?)')).toBeInTheDocument()
    })

    it('reverts every switch on ✗', async () => {
      const { written, user } = host({ operator: 'plus', values: [1, 2] })
      await openPicker(user, 'Plus (+)')
      await user.keyboard('multiply{Enter}')
      await user.click(screen.getByText('Multiply (*)'))
      await user.keyboard('subtract{Enter}')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(latest(written)).toEqual({ operator: 'plus', values: [1, 2] })
    })

    it('toggles the spelling when the current operator is chosen again', async () => {
      const { written, user } = host({ operator: 'plus', values: [1, 2] })
      await openPicker(user, 'Plus (+)')
      expect(screen.getByText('⇄ select again to write as +')).toBeInTheDocument()
      await user.click(screen.getByText('⇄ select again to write as +'))
      expect(latest(written)).toEqual({ operator: '+', values: [1, 2] })
    })

    it("opens on a broken node with fig-tree's suggestion, so Enter repairs it", async () => {
      const { written, user } = host({ operator: 'plsu', values: [1, 2] })
      await user.click(screen.getByRole('button', { name: 'Open toolbar' }))
      expect(document.querySelector('.ft-select-highlighted')).toHaveTextContent('Plus (+)')
      await user.keyboard('{Enter}')
      expect(latest(written)).toEqual({ operator: 'plus', values: [1, 2] })
    })

    it("won't choose an operator that can't fit the node's position", async () => {
      const { written, user } = host({
        operator: 'round',
        value: { operator: 'plus', values: [1] },
      })
      await user.click(screen.getAllByRole('button', { name: 'Open toolbar' })[1])
      await user.click(screen.getByText('Plus (+)'))
      await user.keyboard('lower')
      expect(screen.getByText('Not valid here')).toBeInTheDocument()
      await user.click(screen.getByText('Lower case'))
      expect(written).toEqual([])
    })

    it("offers a host's operators like any other", async () => {
      const { written, user } = host({ operator: 'plus', values: [1, 2] })
      await openPicker(user, 'Plus (+)')
      await user.keyboard('reverse{Enter}')
      expect(latest(written)).toMatchObject({ operator: 'reverse' })
    })

    it('closes the toolbar on a switch to literal, which has its own definition', async () => {
      const { container, written, user } = host({ operator: 'plus', values: [1, 2] })
      await openPicker(user, 'Plus (+)')
      await user.keyboard('literal{Enter}')
      expect(latest(written)).toEqual({
        operator: 'literal',
        value: 'No content inside a literal node is evaluated',
      })
      expect(container.querySelector('.ft-toolbar')).toBeNull()
    })
  })

  describe('adding parameters', () => {
    const openAdd = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole('button', { name: 'Open toolbar' }))
      await user.click(screen.getByText('Add parameter'))
    }

    it('adds a parameter at its starting value, and keeps the toolbar open', async () => {
      const { container, written, user } = host({ operator: 'round', value: 3.14159 })
      await openAdd(user)
      await user.click(screen.getByText('decimals'))
      expect(latest(written)).toEqual({ operator: 'round', value: 3.14159, decimals: 2 })
      expect(container.querySelector('.ft-toolbar')).toBeInTheDocument()
      await user.click(screen.getByText('Add parameter'))
      await user.click(screen.getByText('fallback'))
      expect(latest(written)).toEqual({
        operator: 'round',
        value: 3.14159,
        decimals: 2,
        fallback: null,
      })
    })

    it('reverts every add on ✗', async () => {
      const { written, user } = host({ operator: 'round', value: 3.14159 })
      await openAdd(user)
      await user.click(screen.getByText('decimals'))
      await user.click(screen.getByText('Add parameter'))
      await user.click(screen.getByText('vars'))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(latest(written)).toEqual({ operator: 'round', value: 3.14159 })
    })

    it('lists a missing required parameter first, marked required', async () => {
      const { user } = host({ operator: 'if', condition: true, thn: 'x' })
      await openAdd(user)
      const entries = [...document.querySelectorAll('.ft-select-option')].map(
        (entry) => entry.textContent
      )
      expect(entries[0]).toMatch(/^then.*required/)
      expect(entries[1]).toMatch(/^else/)
    })

    it('is left out on a broken node, and when nothing is left to add', () => {
      const { unmount } = editor({ operator: 'plsu', values: [1] })
      fireEvent.click(screen.getByRole('button', { name: 'Open toolbar' }))
      expect(screen.queryByText('Add parameter')).toBeNull()
      unmount()
      const complete = { '//': 'x', operator: 'abs', value: 1, fallback: 0, useCache: true }
      editor({ ...complete, vars: {} })
      fireEvent.click(screen.getByRole('button', { name: 'Open toolbar' }))
      expect(screen.queryByText('Add parameter')).toBeNull()
    })
  })
})
