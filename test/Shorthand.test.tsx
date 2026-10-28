import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators, httpOperators } from 'fig-tree-evaluator'
import { operatorListings } from 'fig-tree-evaluator/catalog'
import { FigTreeEditor } from '../src'
import { keyLabel } from './queries'
import { type EditorProps } from './fixtures'

// The core and HTTP operators, with one fragment carrying a listing and one
// without
const fragments = {
  getCapital: {
    expression: { $plus: ['Capital of ', '$params.country'] },
    parameters: { country: { type: 'string' as const } },
    listing: {
      displayName: 'Capital city',
      description: "Gets a country's capital city",
      colors: { background: 'black', text: 'white' },
    },
  },
  greet: {
    expression: { $plus: ['Hello ', '$params.name'] },
    parameters: { name: { type: 'string' as const } },
  },
}
const figTree = new FigTree({ operators: [coreOperators, httpOperators()], fragments })

const editor = (expression: unknown, props: EditorProps = {}) =>
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
const host = (initial: unknown, props: EditorProps = {}) => {
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

const displayBar = (container: HTMLElement, index = 0) =>
  container.querySelectorAll<HTMLElement>('.ft-display-bar')[index]
// What sits on the button's line
const onLine = (container: HTMLElement) =>
  displayBar(container).querySelector<HTMLElement>('.ft-display-bar-value')

const description = (name: string) => operatorListings[name].description!

describe('the shorthand node', () => {
  it("shows the name as written, with its `$`, and the operator's display name and card", () => {
    const { container } = editor({ $if: { condition: true, then: 'Yes' } })
    const bar = displayBar(container)
    expect(bar).toHaveClass('ft-shorthand')
    expect(within(bar).getByRole('button', { name: '$if' })).toBeInTheDocument()
    expect(bar.querySelector('.ft-display-name-text')).toHaveTextContent('Conditional (?)')
    // The stylesheet hides the card until hovered
    expect(within(bar).getByRole('tooltip', { hidden: true })).toHaveTextContent(description('if'))
  })

  it('has no Canonical badge', () => {
    const { container } = editor({ $plus: [1, 2] })
    expect(container.querySelector('.ft-canonical-badge')).toBeNull()
  })

  it('shows an alias as written', () => {
    const { container } = editor({ '$+': [1, 2] })
    expect(within(displayBar(container)).getByRole('button', { name: '$+' })).toBeInTheDocument()
  })

  describe('editing', () => {
    const pencil = () => screen.getByRole('button', { name: 'Open toolbar' })
    const toolbar = (container: HTMLElement) => container.querySelector('.ft-toolbar')
    const choose = async (user: ReturnType<typeof userEvent.setup>, from: string, to: string) => {
      await user.click(screen.getByText(from))
      await user.keyboard(`${to}{Enter}`)
    }

    it('opens the toolbar from the pencil, with the rows beneath it', () => {
      const { container } = editor({ $plus: [1, 2] })
      fireEvent.click(pencil())
      expect(within(toolbar(container) as HTMLElement).getByText('Plus (+)')).toBeInTheDocument()
      expect(displayBar(container)).toBeUndefined()
      expect(container.querySelectorAll('.jer-collection-header-row')[1]).toHaveTextContent('[')
      fireEvent.click(screen.getByRole('button', { name: 'Done' }))
      expect(toolbar(container)).toBeNull()
      expect(displayBar(container)).toBeInTheDocument()
    })

    it("shows json-edit-react's raw-JSON editor alone from its ✎", () => {
      const { container } = editor({ $plus: [1, 2] })
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      expect(JSON.parse(screen.getByRole<HTMLTextAreaElement>('textbox').value)).toEqual({
        $plus: [1, 2],
      })
      expect(displayBar(container)).toBeUndefined()
      expect(toolbar(container)).toBeNull()
    })

    it('moves a single value from the header line to beneath the toolbar', () => {
      const { container } = editor({ $not: true })
      fireEvent.click(pencil())
      const value = screen.getByText('true')
      expect(toolbar(container)).not.toContainElement(value)
      expect(container.querySelector('.ft-node')).toContainElement(value)
    })

    it('offers no pencil on a broken node, or where editing is not allowed', () => {
      const broken = editor({ $plus: [1], extra: 2 })
      expect(screen.queryByRole('button', { name: 'Open toolbar' })).toBeNull()
      broken.unmount()
      editor({ $plus: [1, 2] }, { allowEdit: false })
      expect(screen.queryByRole('button', { name: 'Open toolbar' })).toBeNull()
    })

    describe('switching the operator', () => {
      it('keeps an argument list, the modifiers and the toolbar', async () => {
        const { container, written, user } = host({ $plus: [1, 2], fallback: 0 })
        await user.click(pencil())
        await choose(user, 'Plus (+)', 'multiply')
        expect(latest(written)).toEqual({ $multiply: [1, 2], fallback: 0 })
        expect(toolbar(container)).toBeInTheDocument()
      })

      it('keeps the spelling, where the new operator has an alias', async () => {
        const { written, user } = host({ '$+': [1, 2] })
        await user.click(pencil())
        await choose(user, 'Plus (+)', 'multiply')
        expect(latest(written)).toEqual({ '$*': [1, 2] })
      })

      it('fills an argument list in, rather than giving a named payload', async () => {
        const { written, user } = host({ $plus: [1, 2] })
        await user.click(pencil())
        await choose(user, 'Plus (+)', 'if')
        expect(latest(written)).toEqual({
          $if: [expect.anything() as unknown, 'The condition is true'],
        })
      })

      it('keeps a named payload named', async () => {
        const { written, user } = host({ $if: { condition: true, then: 1 } })
        await user.click(pencil())
        await choose(user, 'Conditional (?)', 'and')
        expect(latest(written)).toEqual({ $and: { values: expect.anything() as unknown } })
      })

      it('leaves the children in their own forms', async () => {
        const { written, user } = host({ $plus: [{ operator: 'abs', value: -1 }, { $abs: 2 }] })
        await user.click(screen.getAllByRole('button', { name: 'Open toolbar' })[0])
        await choose(user, 'Plus (+)', 'multiply')
        expect(latest(written)).toEqual({
          $multiply: [{ operator: 'abs', value: -1 }, { $abs: 2 }],
        })
      })

      it('quotes the node as written on a switch to literal', async () => {
        const { container, written, user } = host({ $plus: [1, 2] })
        await user.click(pencil())
        await choose(user, 'Plus (+)', 'literal')
        expect(latest(written)).toEqual({ $literal: { $plus: [1, 2] } })
        expect(toolbar(container)).toBeInTheDocument()
      })

      it('reverts every change on ✗', async () => {
        const { written, user } = host({ $plus: [1, 2] })
        await user.click(pencil())
        await choose(user, 'Plus (+)', 'multiply')
        await choose(user, 'Multiply (*)', 'if')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(latest(written)).toEqual({ $plus: [1, 2] })
      })
    })

    describe('adding a parameter', () => {
      const add = async (user: ReturnType<typeof userEvent.setup>, key: string) => {
        await user.click(screen.getByText('Add parameter'))
        await user.click(screen.getByText(key))
      }

      it('adds to an argument list where it can, keeping the toolbar', async () => {
        const { container, written, user } = host({ $if: [true, 1] })
        await user.click(pencil())
        await add(user, 'else')
        expect(latest(written)).toEqual({ $if: [true, 1, expect.anything() as unknown] })
        expect(toolbar(container)).toBeInTheDocument()
      })

      it('adds to a named payload, and a modifier beside it', async () => {
        const { written, user } = host({ $if: { condition: true, then: 1 } })
        await user.click(pencil())
        await add(user, 'else')
        await add(user, 'fallback')
        expect(latest(written)).toEqual({
          $if: { condition: true, then: 1, else: expect.anything() as unknown },
          fallback: null,
        })
      })
    })

    describe('as a fragment call', () => {
      it('switches the fragment, keeping the payload named', async () => {
        const { written, user } = host({ $greet: { name: 'Ada' } })
        await user.click(pencil())
        await choose(user, 'greet', 'getCapital')
        expect(latest(written)).toEqual({ $getCapital: { country: expect.anything() as unknown } })
      })

      it("doesn't offer dynamic arguments, which shorthand can't hold", async () => {
        const { user } = host({ $greet: { name: 'Ada' } })
        await user.click(pencil())
        await user.click(screen.getByText('Add parameter'))
        const entries = [...document.querySelectorAll('.ft-select-option-title')].map(
          (entry) => entry.textContent
        )
        expect(entries).toContain('fallback')
        expect(entries).not.toContain('Dynamic arguments')
      })
    })

    describe('switching the node type', () => {
      const switchTo = async (
        user: ReturnType<typeof userEvent.setup>,
        from: string,
        to: string
      ) => {
        await user.click(screen.getByText(from, { selector: '.ft-select-trigger-label' }))
        await user.click(screen.getByText(to, { selector: '.ft-select-option-title' }))
      }

      it('stays in shorthand, keeping the toolbar, with the picker open', async () => {
        const { container, written, user } = host({ $upper: 'x', fallback: 'y' })
        await user.click(pencil())
        await switchTo(user, 'Operator', 'Fragment')
        expect(latest(written)).toEqual({ $getCapital: { country: 'Replace me' }, fallback: 'y' })
        expect(toolbar(container)).toBeInTheDocument()
        expect(screen.getByPlaceholderText('Search fragments')).toHaveFocus()
        await user.keyboard('{Escape}')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(latest(written)).toEqual({ $upper: 'x', fallback: 'y' })
      })

      it('comes back to an argument list after a switch through a named payload', async () => {
        const { written, user } = host({ $upper: 'x' })
        await user.click(pencil())
        await switchTo(user, 'Operator', 'Fragment')
        await user.keyboard('{Escape}')
        await switchTo(user, 'Fragment', 'Operator')
        expect(latest(written)).toEqual({ $plus: [1, 2, 3] })
      })

      it('switches to a value, closing the toolbar', async () => {
        const { container, written, user } = host({ $round: [1, { $abs: 2 }] })
        await user.click(screen.getAllByRole('button', { name: 'Open toolbar' })[1])
        await switchTo(user, 'Operator', 'Value')
        expect(latest(written)).toEqual({ $round: [1, 2] })
        expect(toolbar(container)).toBeNull()
      })
    })
  })

  describe('its rows', () => {
    it("shows a named payload's rows beneath the header, as the node's own", () => {
      const { container } = editor({ $if: { condition: true, then: 'Yes' } })
      expect(keyLabel('condition')).toBeInTheDocument()
      expect(() => keyLabel('$if')).toThrow()
      expect(onLine(container)).toBeNull()
    })

    it('keeps an argument list beneath the header, with its brackets and edit tools', () => {
      const { container } = editor({ $plus: [1, 2] })
      expect(onLine(container)).toBeNull()
      expect(() => keyLabel('$plus')).toThrow()
      const list = container.querySelectorAll('.jer-collection-header-row')[1]
      expect(list).toHaveTextContent('[')
      expect(within(list as HTMLElement).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    })

    it("puts a single plain value or reference on the button's line", () => {
      const plain = editor({ $not: true })
      expect(within(onLine(plain.container)!).getByText('true')).toBeInTheDocument()
      expect(() => keyLabel('$not')).toThrow()
      // Its own row, with its own edit tools
      expect(
        within(onLine(plain.container)!).getByRole('button', { name: 'Edit' })
      ).toBeInTheDocument()
      plain.unmount()
      const reference = editor({ $not: '$data.x' })
      expect(within(onLine(reference.container)!).getByText(/\$data\.x/)).toBeInTheDocument()
    })

    it('puts a single node beneath the header, and the modifiers beneath the value', () => {
      const nested = editor({ $not: { $greaterThan: ['$data.age', 18] } })
      expect(onLine(nested.container)).toBeNull()
      expect(nested.container.querySelectorAll('.ft-display-bar')).toHaveLength(2)
      nested.unmount()
      const { container } = editor({ $http: 'https://example.com', fallback: null })
      expect(within(onLine(container)!).getByText(/https:\/\/example\.com/)).toBeInTheDocument()
      expect(displayBar(container)).not.toContainElement(keyLabel('fallback'))
    })
  })

  describe('as a fragment call', () => {
    it("shows the fragment's hints, as a full call does", () => {
      const { container } = editor({ $getCapital: { country: 'NZ' } })
      const bar = displayBar(container)
      expect(within(bar).getByRole('button', { name: '$getCapital' })).toHaveStyle({
        backgroundColor: 'rgb(0, 0, 0)',
        color: 'rgb(255, 255, 255)',
      })
      expect(bar.querySelector('.ft-display-name-text')).toHaveTextContent(
        'Capital city · fragment'
      )
      expect(within(bar).getByRole('tooltip', { hidden: true })).toHaveTextContent(
        "Gets a country's capital city"
      )
      expect(keyLabel('country')).toBeInTheDocument()
    })

    it('shows "Fragment" alone, in `fragmentColors`, where it has no listing', () => {
      const { container } = editor({ $greet: { name: 'Ada' } })
      const bar = displayBar(container)
      expect(within(bar).getByRole('button', { name: '$greet' })).toHaveStyle({
        backgroundColor: 'rgb(56, 96, 126)',
      })
      expect(bar.querySelector('.ft-display-name-text')).toHaveTextContent(/^Fragment$/)
    })
  })

  it("adds the host's defaults to the card, unless the payload sets them", () => {
    const instance = new FigTree({
      operators: [coreOperators, httpOperators()],
      operatorDefaults: { http: { timeout: 5000 } },
    })
    const line = 'This application sets timeout: 5000 on every http node'
    const positional = editor({ $http: 'https://example.com' }, { figTree: instance })
    expect(
      within(displayBar(positional.container)).getByRole('tooltip', { hidden: true })
    ).toHaveTextContent(line)
    positional.unmount()
    const named = editor(
      { $http: { url: 'https://example.com', timeout: 1 } },
      { figTree: instance }
    )
    expect(
      within(displayBar(named.container)).getByRole('tooltip', { hidden: true })
    ).not.toHaveTextContent(line)
  })

  it('says on the card whether the cache is in force, where the node caches', () => {
    const card = (container: HTMLElement) =>
      within(displayBar(container)).getByRole('tooltip', { hidden: true })
    const request = editor({ $http: 'https://example.com' })
    expect(card(request.container)).toHaveTextContent('Cache: active')
    request.unmount()
    const off = editor({ $http: 'https://example.com', noCache: true })
    expect(card(off.container)).toHaveTextContent('Cache: disabled')
  })

  describe('its spelling', () => {
    const button = (container: HTMLElement, name: string) =>
      within(displayBar(container)).getByRole('button', { name })

    it('switches between name and alias on a Cmd- or Ctrl-click, keeping its keys in place', () => {
      const { container, written } = host({ $plus: [1, 2], fallback: 0 })
      fireEvent.click(button(container, '$plus'), { metaKey: true })
      expect(latest(written)).toEqual({ '$+': [1, 2], fallback: 0 })
      expect(Object.keys(latest(written) as object)).toEqual(['$+', 'fallback'])
      fireEvent.click(button(container, '$+'), { ctrlKey: true })
      expect(latest(written)).toEqual({ $plus: [1, 2], fallback: 0 })
    })

    it('says so on the card, and does nothing for a fragment or where editing is off', () => {
      const plus = editor({ $plus: [1, 2] })
      expect(plus.container.querySelector('.ft-hover-card-note')).toHaveTextContent(
        /^Cmd\/Ctrl-click to write it as \$\+$/
      )
      plus.unmount()
      const call = host({ $greet: { name: 'Ada' } })
      fireEvent.click(button(call.container, '$greet'), { metaKey: true })
      expect(call.written).toEqual([])
      expect(call.container.querySelector('.ft-hover-card-note')).toBeNull()
      const locked = host({ $plus: [1] }, { allowEdit: false })
      fireEvent.click(button(locked.container, '$plus'), { metaKey: true })
      expect(locked.written).toEqual([])
    })
  })

  describe('when broken', () => {
    it.each([
      [{ $plus: [1], extra: 2 }, '$plus', /'extra' may not sit beside/],
      [{ $plus: 1, $minus: 2 }, '$plus', /'\$minus' may not sit beside/],
      [{ $greet: '$data.x' }, '$greet', /no single-value or positional form/],
      [{ $greet: { name: 'Ada' }, noCache: false }, '$greet', /'noCache' takes only the literal/],
    ])('shows %j as an error, with the message and no button', (expression, name, message) => {
      const { container } = editor(expression)
      const bar = within(displayBar(container))
      expect(bar.queryByRole('button', { name })).not.toBeInTheDocument()
      expect(bar.getByText(name)).toHaveStyle({ color: 'rgb(192, 57, 43)' })
      expect(bar.getByText(message)).toBeInTheDocument()
      // Every row goes beneath, since the line holds the message
      expect(onLine(container)).toBeNull()
    })

    it('is not broken when only missing something', () => {
      const { container } = editor({ $if: ['$data.x'] })
      expect(within(displayBar(container)).getByRole('button', { name: '$if' })).toBeVisible()
    })
  })

  describe('its conversion button', () => {
    const convertButton = (label: string) => screen.getByRole('button', { name: label })

    it('steps through the forms, each commit converting the node where it stands', () => {
      const { written } = host({ x: { $if: { condition: true, then: 'Yes', else: 'No' } } })
      fireEvent.click(convertButton('To positional'))
      expect(latest(written)).toEqual({ x: { $if: [true, 'Yes', 'No'] } })
      fireEvent.click(convertButton('To canonical'))
      expect(latest(written)).toEqual({
        x: { operator: 'if', condition: true, then: 'Yes', else: 'No' },
      })
      fireEvent.click(convertButton('To shorthand'))
      expect(latest(written)).toEqual({ x: { $if: { condition: true, then: 'Yes', else: 'No' } } })
    })

    it('goes from named back to full where there is no positional form', () => {
      // `from` has no position, and `default` no reference form
      editor({ $get: { path: 'a', from: '$data.x', default: 0 } })
      expect(convertButton('To canonical')).toBeInTheDocument()
    })

    it('shows only where converting is allowed and succeeds', () => {
      const locked = editor({ $plus: [1, 2] }, { allowEdit: false })
      expect(screen.queryByRole('button', { name: 'To canonical' })).not.toBeInTheDocument()
      locked.unmount()
      const broken = editor({ $plus: [1], extra: 2 })
      expect(screen.queryByRole('button', { name: 'To canonical' })).not.toBeInTheDocument()
      broken.unmount()
      // `./format` refuses the node beneath, so neither has a button
      editor({ $not: { operator: 'flibble' } })
      expect(screen.queryByRole('button', { name: /^To / })).not.toBeInTheDocument()
    })
  })

  it('summarises itself when collapsed, as written', () => {
    editor(
      { a: { $if: { condition: true, then: 1 } }, b: { '$+': [1, 2] }, c: { $greet: {} } },
      { collapse: 1 }
    )
    expect(screen.getByText('Operator: $if')).toBeInTheDocument()
    expect(screen.getByText('Operator: $+')).toBeInTheDocument()
    expect(screen.getByText('Fragment: $greet')).toBeInTheDocument()
  })
})
