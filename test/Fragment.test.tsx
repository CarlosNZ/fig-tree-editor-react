import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree } from 'fig-tree-evaluator'
import { FigTreeEditor } from '../src'
import { keyLabel } from './queries'

// A registry with one fragment carrying `FragmentHints`, and two without, one
// of them taking no arguments
const figTree = new FigTree({
  fragments: {
    getCapital: {
      expression: { $plus: ['Capital of ', '$params.country'] },
      parameters: { country: { type: 'string' }, fields: { type: 'string', required: false } },
      description: "Gets a country's capital city",
      metadata: {
        displayName: 'Capital city',
        docUrl: 'https://example.com/capital',
        backgroundColor: 'black',
        textColor: 'white',
      },
    },
    greet: {
      expression: { $plus: ['Hello ', '$params.name'] },
      parameters: { name: { type: 'string' } },
    },
    today: { expression: 'Monday' },
  },
})

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
const toolbar = (container: HTMLElement) => container.querySelector('.ft-toolbar')
const pencil = () => screen.getByRole('button', { name: 'Open toolbar' })

const displayBar = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.ft-display-bar')!

describe('the fragment call', () => {
  it('shows the name as written, and its hints: display name, link, colours and card', () => {
    const { container } = editor({ fragment: 'getCapital', parameters: { country: 'NZ' } })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'getCapital' })).toHaveStyle({
      backgroundColor: 'rgb(0, 0, 0)',
      color: 'rgb(255, 255, 255)',
    })
    expect(bar.getByRole('link', { name: 'Capital city' })).toHaveAttribute(
      'href',
      'https://example.com/capital'
    )
    expect(container.querySelector('.ft-display-name')).toHaveTextContent('Capital city · fragment')
    // The stylesheet hides the card until hovered
    expect(bar.getByRole('tooltip', { hidden: true })).toHaveTextContent(
      "Gets a country's capital city"
    )
  })

  it('shows "Fragment" alone, in the editor\'s colours, where it has no hints', () => {
    const { container } = editor({ fragment: 'greet', parameters: { name: 'Ada' } })
    const bar = within(displayBar(container))
    expect(bar.getByRole('button', { name: 'greet' })).toHaveStyle({
      backgroundColor: 'rgb(71, 119, 153)',
      color: 'rgb(235, 223, 90)',
    })
    expect(container.querySelector('.ft-display-name')).toHaveTextContent(/^Fragment$/)
    expect(bar.queryByRole('link')).not.toBeInTheDocument()
    expect(bar.queryByRole('tooltip', { hidden: true })).not.toBeInTheDocument()
  })

  it("takes the host's fragment colours", () => {
    const { container } = editor(
      { fragment: 'greet' },
      { editorTheme: { fragmentBackground: 'purple', fragmentText: 'white' } }
    )
    expect(within(displayBar(container)).getByRole('button', { name: 'greet' })).toHaveStyle({
      backgroundColor: 'rgb(128, 0, 128)',
      color: 'rgb(255, 255, 255)',
    })
  })

  it('shows static arguments as its own rows, without its fragment or parameters rows', () => {
    editor({ fragment: 'getCapital', parameters: { country: 'NZ', fields: 'all' }, fallback: 'x' })
    expect(keyLabel('country')).toBeInTheDocument()
    expect(keyLabel('fields')).toBeInTheDocument()
    expect(keyLabel('fallback')).toBeInTheDocument()
    expect(() => keyLabel('parameters')).toThrow()
    expect(() => keyLabel('fragment')).toThrow()
  })

  it("lines its arguments up as an operator's parameters", () => {
    const { container } = editor({
      call: { fragment: 'greet', parameters: { name: 'Ada' } },
      sum: { operator: 'plus', values: [1, 2] },
    })
    // The row holding a key's row: its margin, and its inner part's
    const holder = (key: string) =>
      keyLabel(key)
        .closest<HTMLElement>('.jer-component')!
        .parentElement!.closest<HTMLElement>('.jer-collection-component')!
    const inner = (key: string) =>
      holder(key).querySelector<HTMLElement>(':scope > .jer-collection-inner')!.style.marginLeft
    // The static arguments' own row adds no indent, its margin cancelling the
    // pull on its rows; the operator's node pulls its rows back as far
    expect(holder('name').style.marginLeft).toBe('1em')
    expect(inner('name')).toBe('-1em')
    expect(inner('values')).toBe('-1em')
    expect(container.querySelectorAll('.ft-node')).toHaveLength(2)
  })

  describe('under a collapse level', () => {
    const expression = {
      call: { fragment: 'getCapital', parameters: { country: { operator: 'upper', value: 'x' } } },
      sum: { operator: 'round', value: { operator: 'abs', value: -1 } },
    }

    it('shows its arguments, whose row never starts collapsed', () => {
      editor({ call: { fragment: 'greet', parameters: { name: 'Ada' } } }, { collapse: 2 })
      expect(screen.getByText('"Ada"')).toBeInTheDocument()
    })

    // json-edit-react keeps a collapsed row's summary in place, shown by class
    const collapsed = (summary: string) =>
      screen.getByText(summary).classList.contains('jer-visible')

    it("collapses an argument at the level an operator's parameter collapses at", () => {
      const { unmount } = editor(expression, { collapse: 2 })
      expect(collapsed('Operator: upper')).toBe(true)
      expect(collapsed('Operator: abs')).toBe(true)
      unmount()
      editor(expression, { collapse: 3 })
      expect(collapsed('Operator: upper')).toBe(false)
      expect(collapsed('Operator: abs')).toBe(false)
    })

    it('keeps its arguments open after a collapse-all and a plain reopen', async () => {
      editor({ call: { fragment: 'greet', parameters: { name: 'Ada' }, fallback: 'x' } })
      const chevron = () =>
        keyLabel('call').closest('.jer-collection-header-row')!.querySelector('.jer-collapse-icon')!
      const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)))
      fireEvent.click(chevron(), { altKey: true })
      await settle()
      fireEvent.click(chevron())
      await settle()
      const inner = keyLabel('name').closest<HTMLElement>('.jer-collection-inner')!
      expect(inner.style.maxHeight).toBe('')
    })

    it("follows a host's collapse filter, apart from the arguments' row", () => {
      const { unmount } = editor(expression, { collapse: ({ key }) => key === 'country' })
      expect(collapsed('Operator: upper')).toBe(true)
      expect(collapsed('Operator: abs')).toBe(false)
      unmount()
      editor(
        { fragment: 'greet', parameters: { name: 'Ada' } },
        { collapse: ({ path }) => path.length > 0 }
      )
      expect(screen.getByText('"Ada"')).toBeInTheDocument()
    })
  })

  it("shows a dynamic call's parameters row with its key", () => {
    editor({ fragment: 'greet', parameters: '$data.form' })
    expect(keyLabel('parameters')).toBeInTheDocument()
  })

  it('is its header alone with no arguments', () => {
    const { container } = editor({ fragment: 'today' })
    expect(displayBar(container)).toBeInTheDocument()
    expect(container.querySelectorAll('.ft-node .jer-key-text')).toHaveLength(0)
  })

  it('renders in a shorthand payload, without the `$name` key', () => {
    editor({ $not: { fragment: 'greet', parameters: { name: 'Ada' } } })
    expect(screen.getByRole('button', { name: 'greet' })).toBeVisible()
    expect(() => keyLabel('$not')).toThrow()
  })

  describe('when broken', () => {
    it('shows an unknown name as an error, with the message', () => {
      const { container } = editor({ fragment: 'greeet' })
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button', { name: 'greeet' })).not.toBeInTheDocument()
      expect(bar.getByText('greeet')).toHaveStyle({ color: 'rgb(192, 57, 43)' })
      expect(bar.getByText(/names no registered fragment/)).toBeInTheDocument()
      expect(container.querySelector('.ft-display-name')).toHaveTextContent(/^Fragment$/)
    })

    it('shows "invalid node" for a name that is not a string', () => {
      const { container } = editor({ fragment: 42 })
      expect(within(displayBar(container)).getByText('invalid node')).toBeInTheDocument()
    })

    it('is broken by `useCache`, which fragment calls may not have', () => {
      const { container } = editor({
        fragment: 'greet',
        parameters: { name: 'Ada' },
        useCache: true,
      })
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button', { name: 'greet' })).not.toBeInTheDocument()
      expect(bar.getByText(/'useCache' is not available on fragment calls/)).toBeInTheDocument()
    })
  })

  it('converts a static call to shorthand, and offers nothing on a dynamic one', () => {
    const { written } = host({ call: { fragment: 'greet', parameters: { name: 'Ada' } } })
    fireEvent.click(screen.getByRole('button', { name: 'To shorthand' }))
    expect(latest(written)).toEqual({ call: { $greet: { name: 'Ada' } } })
    cleanup()
    editor({ fragment: 'greet', parameters: '$data.form' })
    expect(screen.queryByRole('button', { name: /^To (shorthand|full)$/ })).not.toBeInTheDocument()
  })

  it('summarises itself when collapsed', () => {
    editor({ call: { fragment: 'greet', parameters: { name: 'Ada' } } }, { collapse: 1 })
    expect(screen.getByText('Fragment: greet')).toBeInTheDocument()
  })

  describe('editing', () => {
    it('opens the toolbar from the pencil, with the picker closed on the current fragment', () => {
      const { container } = editor({ fragment: 'getCapital', parameters: { country: 'NZ' } })
      fireEvent.click(pencil())
      expect(within(toolbar(container) as HTMLElement).getByText('Capital city')).toBeVisible()
      expect(container.querySelector('.ft-select-dropdown')).toBeNull()
      expect(keyLabel('country')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(toolbar(container)).toBeNull()
    })

    it("shows json-edit-react's raw-JSON editor alone from its ✎", () => {
      const { container } = editor({ call: { fragment: 'greet', parameters: { name: 'Ada' } } })
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
      expect(container.querySelector('.ft-node textarea')).toBeInTheDocument()
      expect(container.querySelector('.ft-display-bar')).toBeNull()
    })

    it('has no ＋ of its own, since the toolbar adds its arguments', () => {
      editor({ fragment: 'getCapital', parameters: { country: 'NZ' } })
      expect(screen.queryAllByRole('button', { name: 'Add' })).toEqual([])
    })
  })

  describe('the fragment picker', () => {
    const openPicker = async (user: ReturnType<typeof userEvent.setup>, current: string) => {
      await user.click(pencil())
      await user.click(screen.getByText(current, { selector: '.ft-select-trigger-label' }))
    }

    it('lists the fragments in order, by display name, with their descriptions', async () => {
      const { user } = host({ fragment: 'greet', parameters: { name: 'Ada' } })
      await openPicker(user, 'greet')
      const entries = [...document.querySelectorAll('.ft-select-option')].map(
        (entry) => entry.textContent
      )
      expect(entries).toEqual(["Capital cityGets a country's capital city", 'greet', 'today'])
    })

    it('switches fragment, keeping the modifiers and shared arguments, and the toolbar', async () => {
      const { container, written, user } = host({
        fragment: 'getCapital',
        parameters: { country: 'NZ', fields: 'all' },
        fallback: 'x',
      })
      await openPicker(user, 'Capital city')
      await user.keyboard('greet{Enter}')
      expect(latest(written)).toEqual({
        fragment: 'greet',
        parameters: { name: 'Replace me' },
        fallback: 'x',
      })
      expect(toolbar(container)).toBeInTheDocument()
      await user.click(screen.getByText('greet', { selector: '.ft-select-trigger-label' }))
      await user.keyboard('today{Enter}')
      expect(latest(written)).toEqual({ fragment: 'today', fallback: 'x' })
    })

    it('reverts every switch on ✗', async () => {
      const { written, user } = host({ fragment: 'greet', parameters: { name: 'Ada' } })
      await openPicker(user, 'greet')
      await user.keyboard('today{Enter}')
      await user.click(screen.getByText('today', { selector: '.ft-select-trigger-label' }))
      await user.keyboard('capital{Enter}')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(latest(written)).toEqual({ fragment: 'greet', parameters: { name: 'Ada' } })
    })

    it('changes nothing when the current fragment is chosen again', async () => {
      const { written, user } = host({ fragment: 'greet', parameters: { name: 'Ada' } })
      await openPicker(user, 'greet')
      await user.click(screen.getByText('greet', { selector: '.ft-select-option-title' }))
      expect(written).toEqual([])
    })

    it("opens on a broken call with fig-tree's suggestion, so Enter repairs it", async () => {
      const { written, user } = host({ fragment: 'gret', parameters: { name: 'Ada' } })
      await user.click(pencil())
      expect(document.querySelector('.ft-select-highlighted')).toHaveTextContent('greet')
      await user.keyboard('{Enter}')
      expect(latest(written)).toEqual({ fragment: 'greet', parameters: { name: 'Ada' } })
    })

    it("won't choose a fragment that can't fit the call's position", async () => {
      const { written, user } = host({
        operator: 'round',
        value: { fragment: 'greet', parameters: { name: 'Ada' } },
      })
      await user.click(screen.getAllByRole('button', { name: 'Open toolbar' })[1])
      await user.click(screen.getByText('greet', { selector: '.ft-select-trigger-label' }))
      expect(screen.getByText('Not valid here')).toBeInTheDocument()
      await user.click(screen.getByText('today'))
      expect(written).toEqual([])
    })
  })

  describe('adding parameters', () => {
    const openAdd = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(pencil())
      await user.click(screen.getByText('Add parameter'))
    }

    it('adds an argument inside parameters, and keeps the toolbar open', async () => {
      const { container, written, user } = host({
        fragment: 'getCapital',
        parameters: { country: 'NZ' },
      })
      await openAdd(user)
      await user.click(screen.getByText('fields'))
      expect(latest(written)).toEqual({
        fragment: 'getCapital',
        parameters: { country: 'NZ', fields: 'Replace me' },
      })
      expect(toolbar(container)).toBeInTheDocument()
    })

    it('switches to dynamic arguments and back', async () => {
      const { container, written, user } = host({ fragment: 'greet', parameters: { name: 'Ada' } })
      await openAdd(user)
      await user.click(screen.getByText('Dynamic arguments'))
      expect(latest(written)).toEqual({ fragment: 'greet', parameters: '$data' })
      expect(keyLabel('parameters')).toBeInTheDocument()
      expect(toolbar(container)).toBeInTheDocument()
      await user.click(screen.getByText('Add parameter'))
      expect(screen.queryByText('name')).toBeNull()
      await user.click(screen.getByText('Static arguments'))
      expect(latest(written)).toEqual({ fragment: 'greet', parameters: { name: 'Replace me' } })
    })

    it('is left out on a broken call', () => {
      editor({ fragment: 'gret' })
      fireEvent.click(pencil())
      expect(screen.queryByText('Add parameter')).toBeNull()
    })
  })

  describe('created from the type dropdown', () => {
    // Opens the last value row's editor and chooses a type
    const chooseType = async (user: ReturnType<typeof userEvent.setup>, type: string) => {
      await user.click(screen.getAllByRole('button', { name: 'Edit' }).at(-1)!)
      await user.selectOptions(screen.getByRole('combobox'), type)
    }

    it('starts the first fragment that can fit, seeded, with its picker open', async () => {
      const { container, written, user } = host({ operator: 'round', value: 3 })
      await chooseType(user, 'Fragment')
      expect(latest(written)).toEqual({
        operator: 'round',
        value: { fragment: 'getCapital', parameters: { country: 'Replace me' } },
      })
      expect(toolbar(container)).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search fragments')).toHaveFocus()
      await user.keyboard('greet{Enter}')
      expect(latest(written)).toEqual({
        operator: 'round',
        value: { fragment: 'greet', parameters: { name: 'Replace me' } },
      })
    })

    it('restores the value it replaced on ✗', async () => {
      const { written, user } = host({ operator: 'round', value: 3 })
      await chooseType(user, 'Fragment')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(latest(written)).toEqual({ operator: 'round', value: 3 })
    })

    it("starts the host's default fragment where it can fit", async () => {
      const greet = host({ operator: 'round', value: 3 }, { defaultFragment: 'greet' })
      await chooseType(greet.user, 'Fragment')
      expect(latest(greet.written)).toMatchObject({ value: { fragment: 'greet' } })
    })

    it("passes over the host's default where it can't fit", async () => {
      const { written, user } = host({ operator: 'round', value: 3 }, { defaultFragment: 'today' })
      await chooseType(user, 'Fragment')
      expect(latest(written)).toMatchObject({ value: { fragment: 'getCapital' } })
    })
  })

  describe('the node-type switch', () => {
    const switchTo = async (
      user: ReturnType<typeof userEvent.setup>,
      from: string,
      to: string,
      pencilIndex = 0
    ) => {
      await user.click(screen.getAllByRole('button', { name: 'Open toolbar' })[pencilIndex])
      await user.click(screen.getByText(from, { selector: '.ft-select-trigger-label' }))
      await user.click(screen.getByText(to, { selector: '.ft-select-option-title' }))
    }

    it('switches an operator node to a fragment call, which opens on its picker', async () => {
      const { container, written, user } = host({ operator: 'upper', value: 'x', fallback: 'y' })
      await switchTo(user, 'Operator', 'Fragment')
      expect(latest(written)).toEqual({
        fragment: 'getCapital',
        parameters: { country: 'Replace me' },
        fallback: 'y',
      })
      expect(toolbar(container)).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Search fragments')).toHaveFocus()
    })

    it('restores the node as the session opened on ✗ in the new toolbar', async () => {
      const { written, user } = host({ operator: 'upper', value: 'x', fallback: 'y' })
      await switchTo(user, 'Operator', 'Fragment')
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(latest(written)).toEqual({ operator: 'upper', value: 'x', fallback: 'y' })
    })

    it('switches a fragment call to an operator node, which opens on its picker', async () => {
      const { container, written, user } = host({
        fragment: 'greet',
        parameters: { name: 'Ada' },
        vars: { a: 1 },
      })
      await switchTo(user, 'Fragment', 'Operator')
      expect(latest(written)).toEqual({ operator: 'plus', values: [1, 2, 3], vars: { a: 1 } })
      expect(toolbar(container)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/^Search operators/)).toHaveFocus()
    })

    it('switches to a value at its starting value, and closes the toolbar', async () => {
      const { container, written, user } = host({
        operator: 'round',
        value: 1,
        decimals: { fragment: 'greet', parameters: { name: 'Ada' } },
      })
      await switchTo(user, 'Fragment', 'Value', 1)
      expect(latest(written)).toEqual({ operator: 'round', value: 1, decimals: 2 })
      expect(toolbar(container)).toBeNull()
    })

    it('offers Fragment only where a registered fragment can fit', async () => {
      const onlyToday = new FigTree({ fragments: { today: { expression: 'Monday' } } })
      const { user } = host(
        { operator: 'round', value: { operator: 'abs', value: 1 } },
        { figTree: onlyToday }
      )
      await user.click(screen.getAllByRole('button', { name: 'Open toolbar' })[1])
      await user.click(screen.getByText('Operator', { selector: '.ft-select-trigger-label' }))
      const options = [...document.querySelectorAll('.ft-select-option-title')].map(
        (option) => option.textContent
      )
      expect(options).toEqual(['Operator', 'Value'])
    })
  })
})
