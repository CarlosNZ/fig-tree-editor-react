import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators, httpOperators } from 'fig-tree-evaluator'
import { FigTreeEditor } from '../src'
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

const displayBar = (container: HTMLElement, index = 0) =>
  container.querySelectorAll<HTMLElement>('.ft-display-bar')[index]

// A host holding the expression, so each commit comes back as the editor's
// next expression. In StrictMode, as a host in development renders it, which
// runs each effect twice on mount.
const host = (initial: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) => {
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
        {...props}
      />
    )
  }
  const { container } = render(<Host />, { wrapper: StrictMode })
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
    expect(keyLabel('values')).toBeInTheDocument()
    expect(keyLabel('fallback')).toBeInTheDocument()
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
    expect(names).toEqual(['if', 'greaterThan', '$not', 'and'])
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

  describe('its spelling', () => {
    const button = (container: HTMLElement, name: string) =>
      within(displayBar(container)).getByRole('button', { name })

    it('switches between name and alias on a Cmd- or Ctrl-click on the button', () => {
      const { container, written } = host({ operator: 'plus', values: [1, 2] })
      fireEvent.click(button(container, 'plus'), { metaKey: true })
      expect(latest(written)).toEqual({ operator: '+', values: [1, 2] })
      fireEvent.click(button(container, '+'), { ctrlKey: true })
      expect(latest(written)).toEqual({ operator: 'plus', values: [1, 2] })
    })

    it("leaves a plain click, or another modifier, to the button's own action", () => {
      const { container, written } = host({ operator: 'plus', values: [1, 2] })
      fireEvent.click(button(container, 'plus'))
      fireEvent.click(button(container, 'plus'), { altKey: true })
      expect(written).toEqual([])
    })

    it("takes the host's clipboard modifier", () => {
      const { container, written } = host(
        { operator: 'plus', values: [1, 2] },
        { keyboardControls: { clipboardModifier: 'Shift' } }
      )
      fireEvent.click(button(container, 'plus'), { metaKey: true })
      expect(written).toEqual([])
      fireEvent.click(button(container, 'plus'), { shiftKey: true })
      expect(latest(written)).toEqual({ operator: '+', values: [1, 2] })
    })

    it('says so on the card, and does nothing without an alias or where editing is off', () => {
      const plus = editor({ operator: 'plus', values: [1, 2] })
      expect(
        within(displayBar(plus.container)).getByRole('tooltip', { hidden: true })
      ).toHaveTextContent('Cmd/Ctrl-click to write it as +')
      // As a note, set apart from the description
      expect(plus.container.querySelector('.ft-hover-card-note')).toHaveTextContent(
        /^Cmd\/Ctrl-click to write it as \+$/
      )
      plus.unmount()
      const round = host({ operator: 'round', value: 1 })
      fireEvent.click(button(round.container, 'round'), { metaKey: true })
      expect(round.written).toEqual([])
      expect(
        within(displayBar(round.container)).getByRole('tooltip', { hidden: true })
      ).not.toHaveTextContent('click to write')
      const locked = host({ operator: 'plus', values: [1] }, { allowEdit: false })
      fireEvent.click(button(locked.container, 'plus'), { metaKey: true })
      expect(locked.written).toEqual([])
    })
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

    it('is broken by a malformed key, whose row stays', () => {
      const { container } = editor({ operator: 'plus', values: [1], parameters: {} })
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button', { name: 'plus' })).not.toBeInTheDocument()
      expect(bar.getByText(/'parameters' is reserved/)).toBeInTheDocument()
      expect(keyLabel('parameters')).toBeInTheDocument()
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
      expect(keyLabel('values')).toBeInTheDocument()
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

    it('changes nothing when the current operator is chosen again', async () => {
      const { written, user } = host({ operator: 'plus', values: [1, 2] })
      await openPicker(user, 'Plus (+)')
      await user.click(screen.getByText('Plus (+)', { selector: '.ft-select-option-title' }))
      expect(written).toEqual([])
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

    it('keeps the toolbar open on a switch to literal, which quotes the node', async () => {
      const { container, written, user } = host({ operator: 'plus', values: [1, 2] })
      await openPicker(user, 'Plus (+)')
      await user.keyboard('literal{Enter}')
      expect(latest(written)).toEqual({
        operator: 'literal',
        value: { operator: 'plus', values: [1, 2] },
      })
      expect(container.querySelector('.ft-toolbar')).toBeInTheDocument()
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
      const complete = { '//': 'x', operator: 'abs', value: 1, fallback: 0 }
      editor({ ...complete, vars: {} })
      fireEvent.click(screen.getByRole('button', { name: 'Open toolbar' }))
      expect(screen.queryByText('Add parameter')).toBeNull()
    })
  })

  describe('creating a node from the type dropdown', () => {
    // Opens the last value row's editor and chooses a type
    const chooseType = async (user: ReturnType<typeof userEvent.setup>, type: string) => {
      await user.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!)
      await user.selectOptions(screen.getByRole('combobox'), type)
    }
    const typeNames = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!)
      return [...screen.getByRole('combobox').querySelectorAll('option')].map(
        ({ textContent }) => textContent
      )
    }

    it("offers the row's slot's types", async () => {
      const { user } = host({ operator: 'round', value: 3 })
      expect(await typeNames(user)).toEqual(['number', 'null', 'Data', 'Operator', 'Fragment'])
    })

    it("starts the slot's default operator, with its picker open", async () => {
      const { container, written, user } = host({ operator: 'round', value: 3 })
      await chooseType(user, 'Operator')
      expect(latest(written)).toEqual({
        operator: 'round',
        value: { operator: 'plus', values: [1, 2, 3] },
      })
      expect(container.querySelector('.ft-toolbar')).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/^Search operators/)).toHaveFocus()
      await user.keyboard('multiply{Enter}')
      expect(latest(written)).toEqual({
        operator: 'round',
        value: { operator: 'multiply', values: [1, 2, 3] },
      })
    })

    it('restores the value it replaced on ✗', async () => {
      const { written, user } = host({ operator: 'round', value: 3 })
      await chooseType(user, 'Operator')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(latest(written)).toEqual({ operator: 'round', value: 3 })
    })

    it("starts the host's default operator", async () => {
      const { written, user } = host(
        { operator: 'round', value: 3 },
        { defaultOperators: { number: '+' } }
      )
      await chooseType(user, 'Operator')
      expect(latest(written)).toEqual({
        operator: 'round',
        value: { operator: '+', values: [1, 2, 3] },
      })
    })

    it('starts Data and Variable references, with the input open for the path', async () => {
      const { written, user } = host({ operator: 'round', value: 3, vars: { price: 2 } })
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[1])
      await user.selectOptions(screen.getByRole('combobox'), 'Data')
      expect(written).toEqual([])
      expect(screen.getByRole('textbox')).toHaveValue('$data.')
      await user.keyboard('total{Enter}')
      expect(latest(written)).toMatchObject({ value: '$data.total' })
      cleanup()
      const second = host({ operator: 'round', value: 3, vars: { price: 2 } })
      await second.user.click(screen.getAllByRole('button', { name: 'Edit' })[1])
      await second.user.selectOptions(screen.getByRole('combobox'), 'Variable')
      await second.user.keyboard('{Enter}')
      expect(latest(second.written)).toMatchObject({ value: '$vars.price' })
    })

    it('leaves nothing to open a picker later when the host rejects the switch', async () => {
      let reject = true
      const { container, written, user } = host(
        { operator: 'round', value: 3 },
        { onUpdate: () => (reject ? false : undefined) }
      )
      await chooseType(user, 'Operator')
      expect(written).toEqual([])
      reject = false
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: JSON.stringify({ operator: 'round', value: { $plus: [1] } }) },
      })
      await user.click(screen.getByRole('button', { name: 'OK' }))
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      fireEvent.change(screen.getByRole('textbox'), {
        target: {
          value: JSON.stringify({ operator: 'round', value: { operator: 'plus', values: [1] } }),
        },
      })
      await user.click(screen.getByRole('button', { name: 'OK' }))
      expect(latest(written)).toMatchObject({ value: { operator: 'plus' } })
      expect(container.querySelector('.ft-toolbar')).toBeNull()
    })
  })

  describe('hover cards', () => {
    // The card on a row's key, found by the key
    const cardOn = (key: string) => keyLabel(key).querySelector('[role="tooltip"]') ?? undefined

    it("shows a parameter's card on its key", () => {
      editor({ operator: 'round', value: 1, decimals: 2 })
      const card = cardOn('decimals')!
      expect(card.querySelector('.ft-hover-card-title')).toHaveTextContent(
        'decimals · optional · takes an integer'
      )
      expect(card).toHaveTextContent('Default: 0')
    })

    it('leaves the row itself as json-edit-react draws it', () => {
      const { container } = editor({ operator: 'round', value: 1, decimals: 2 })
      const row = keyLabel('decimals').closest('.jer-value-main-row')!
      expect(within(row as HTMLElement).getByText('2')).toBeInTheDocument()
      expect(within(row as HTMLElement).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
      expect(container.querySelectorAll('[data-kind]')).toHaveLength(0)
    })

    it('keeps the key label as the row’s flex item, beside a long value', () => {
      editor({
        operator: 'upper',
        value: 'A long string that wraps onto several lines. '.repeat(4),
      })
      const label = keyLabel('value')
      // json-edit-react's sizing stays on the row's own child, so the value
      // can't squeeze the key
      expect(label.parentElement).toHaveClass('jer-value-main-row')
      expect(label.style.flexShrink).toBe('0')
      expect(label.querySelector('.ft-hover-card-anchor')).not.toBeNull()
    })

    it('shows a card on a node at a parameter, and on the vars block', () => {
      editor({ operator: 'round', value: { operator: 'plus', values: [1] }, vars: { a: 1 } })
      expect(cardOn('value')).toHaveTextContent('value · required · takes a number or null')
      expect(cardOn('vars')).toHaveTextContent('Named values for this node')
    })

    it('shows no card where there is nothing to say', () => {
      editor({ operator: 'round', value: '$vars.a', vars: { a: 1 } })
      expect(cardOn('a')).toBeUndefined()
    })

    it("adds the host's defaults to the operator's card", () => {
      const host = new FigTree({
        operators: [coreOperators, httpOperators()],
        operatorDefaults: { http: { timeout: 5000 } },
      })
      const { container } = editor(
        { operator: 'http', url: 'https://example.com' },
        { figTree: host }
      )
      expect(
        within(displayBar(container)).getByRole('tooltip', { hidden: true })
      ).toHaveTextContent('This application sets timeout: 5000 on every http node')
    })

    it("says on a caching node's card whether its cache is in force", () => {
      const card = (container: HTMLElement, index = 0) =>
        within(displayBar(container, index)).getByRole('tooltip', { hidden: true })
      const request = { operator: 'http', url: 'https://example.com' }
      const active = editor(request)
      expect(card(active.container)).toHaveTextContent('Cache: active')
      active.unmount()
      // A noCache two levels up turns it off, and a node that never caches
      // has no line
      const held = editor({
        operator: 'upper',
        value: { operator: 'buildString', template: '%1', substitutions: [request] },
        noCache: true,
      })
      expect(card(held.container, 2)).toHaveTextContent('Cache: disabled')
      expect(card(held.container, 0)).not.toHaveTextContent('Cache:')
    })

    it('waits before showing any card, by a delay in the stylesheet', () => {
      editor({ operator: 'round', value: 1 })
      const styles = document.head.querySelector('style[data-fig-tree-editor-styles]')!.textContent
      expect(styles).toMatch(/--ft-hover-card-delay:\s*\.?0?\.5s/)
      expect(styles).toMatch(/transition:[^;}]*var\(--ft-hover-card-delay\)/)
    })
  })
})
