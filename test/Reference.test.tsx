import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
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

// A reference's text, found by the text itself
const shownAs = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll<HTMLElement>('.ft-reference .jer-value-string')].find(
    (element) => element.textContent === text
  )!

const selection = () => {
  const input = screen.getByRole<HTMLTextAreaElement>('textbox')
  return [input.selectionStart, input.selectionEnd]
}

// Opens a value row's input by its Edit button, then chooses a type
const chooseType = async (
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  type: string
) => {
  await user.click(screen.getAllByRole('button', { name: 'Edit' })[index])
  await user.selectOptions(screen.getByRole('combobox'), type)
}

describe('a reference', () => {
  it("shows its text in its namespace's colour, short forms and invalid ones included", () => {
    const { container } = editor({
      d: '$data.user',
      short: '$d.user',
      v: '$vars.x',
      p: '$params.x',
      e: '$element.name',
      i: '$index',
      bare: '$vars',
      items: { $map: { input: '$data.list', as: 'item', each: '$item.price' } },
    })
    const colours = {
      '$data.user': 'rgb(123, 63, 196)',
      '$d.user': 'rgb(123, 63, 196)',
      '$vars.x': 'rgb(15, 124, 122)',
      '$params.x': 'rgb(176, 48, 127)',
      '$element.name': 'rgb(138, 90, 0)',
      $index: 'rgb(138, 90, 0)',
      $vars: 'rgb(15, 124, 122)',
      '$item.price': 'rgb(138, 90, 0)',
    }
    for (const [text, colour] of Object.entries(colours))
      expect(shownAs(container, text)).toHaveStyle({ color: colour })
  })

  it('has no quotes, where a plain string has them', () => {
    const { container } = editor({ ref: '$data.user', plain: 'Hello' })
    expect(shownAs(container, '$data.user')).toBeInTheDocument()
    expect(screen.getByText('"Hello"')).toBeInTheDocument()
  })

  it("takes the host's colours", () => {
    const { container } = editor({ ref: '$data.user' }, { editorTheme: { refData: 'purple' } })
    expect(shownAs(container, '$data.user')).toHaveStyle({ color: 'rgb(128, 0, 128)' })
  })

  describe('its card', () => {
    const evaluationData = { user: { name: 'Ada', bio: 'x'.repeat(40) } }
    // The card's text, which the stylesheet shows on hover
    const card = (container: HTMLElement, text: string) =>
      shownAs(container, text).closest('.ft-hover-card-anchor')?.querySelector('.ft-hover-card')
        ?.textContent

    it('shows the value a `$data` reference reads, as compact JSON', () => {
      const { container } = editor({ a: '$data.user.name', b: '$d.user' }, { evaluationData })
      expect(card(container, '$data.user.name')).toBe('"Ada"')
      expect(card(container, '$d.user')).toBe(`{"name":"Ada","bio":"${'x'.repeat(40)}"}`)
    })

    it('shows a short value larger, and as soon as an issue would', () => {
      const { container } = editor(
        { a: '$data.user.name', b: '$data.user.bio' },
        { evaluationData }
      )
      const value = (text: string) =>
        shownAs(container, text).closest('.ft-hover-card-anchor')!.querySelector('.ft-run-value')
      expect(value('$data.user.name')).toHaveAttribute('data-short')
      expect(value('$data.user.bio')).not.toHaveAttribute('data-short')
      expect(
        shownAs(container, '$data.user.name').closest('.ft-hover-card-anchor')
      ).toHaveAttribute('data-urgent')
    })

    it('has none where the reference has issues, whose card shows instead', () => {
      const { container } = editor({ a: '$data.user.age' }, { evaluationData })
      expect(card(container, '$data.user.age')).toBeUndefined()
      expect(container.querySelector('.ft-reference .ft-issue-card')).not.toBeNull()
    })

    it('has none without evaluation data, or in another namespace', () => {
      const { container } = editor({ a: '$data.user' })
      expect(card(container, '$data.user')).toBeUndefined()
      const vars = editor({ vars: { x: 1 }, value: '$vars.x' }, { evaluationData })
      expect(card(vars.container, '$vars.x')).toBeUndefined()
    })
  })

  it("sits on a shorthand's line", () => {
    const { container } = editor({ $not: '$data.user' })
    expect(
      container.querySelector('.ft-display-bar-value')!.querySelector('.ft-reference')
    ).toHaveTextContent('$data.user')
  })

  describe('"To get node"', () => {
    it("replaces the reference with its `get` node, through the host's onUpdate", () => {
      const onUpdate = vi.fn()
      const { written } = host({ name: '$data.user.name' }, { onUpdate })
      fireEvent.click(screen.getByRole('button', { name: 'To get node' }))
      expect(latest(written)).toEqual({ name: { operator: 'get', path: 'user.name' } })
      expect(onUpdate).toHaveBeenCalledOnce()
    })

    it('comes back through the node\'s own button, which reads "To reference"', () => {
      const { written } = host({ name: '$data.user.name' })
      fireEvent.click(screen.getByRole('button', { name: 'To get node' }))
      fireEvent.click(screen.getByRole('button', { name: 'To reference' }))
      expect(latest(written)).toEqual({ name: '$data.user.name' })
    })

    it('is offered only where there is a `get` form and the row can be edited', () => {
      const { container } = editor({ i: '$index', item: '$item.price', ok: '$data.ok' })
      expect(screen.getAllByRole('button', { name: 'To get node' })).toHaveLength(1)
      container.remove()
      editor({ ok: '$data.ok' }, { allowEdit: false })
      expect(screen.queryByRole('button', { name: 'To get node' })).not.toBeInTheDocument()
    })

    it("is among json-edit-react's edit tools, before the host's own buttons", () => {
      const Host = () => <span>host</span>
      editor({ ok: '$data.ok' }, { customButtons: [{ Element: Host, label: 'Host button' }] })
      const toGet = screen.getByRole('button', { name: 'To get node' })
      const tools = toGet.closest('.jer-edit-buttons')!
      expect(tools).not.toBeNull()
      const hostButton = within(tools as HTMLElement).getByRole('button', { name: 'Host button' })
      expect(toGet.compareDocumentPosition(hostButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
  })

  describe('spelled by `referenceNames`', () => {
    it('starts Data as `$d.` where the host prefers the short form', async () => {
      const { user } = host({ operator: 'round', value: 3 }, { referenceNames: 'alias' })
      await chooseType(user, 1, 'Data')
      expect(screen.getByRole('textbox')).toHaveValue('$d.')
      expect(selection()).toEqual([3, 3])
    })

    it("respells the references in a converted subtree, and a get node's source", () => {
      const { written } = host(
        { x: { operator: 'not', value: '$data.ok' }, y: '$vars.row.a' },
        { referenceNames: 'alias' }
      )
      fireEvent.click(screen.getByRole('button', { name: 'To shorthand' }))
      expect(latest(written)).toMatchObject({ x: { $not: { value: '$d.ok' } } })
      const toGet = screen.getAllByRole('button', { name: 'To get node' }).at(-1)!
      fireEvent.click(toGet)
      expect(latest(written)).toMatchObject({ y: { operator: 'get', path: 'a', from: '$v.row' } })
    })
  })

  describe('while editing', () => {
    it("opens json-edit-react's input with the path selected, keeping the namespace", async () => {
      for (const [text, range] of [
        ['$data.user.name', [6, 15]],
        ['$d.user', [3, 7]],
        ['$data[0].x', [5, 10]],
        ['$element', [8, 8]],
      ] as const) {
        const { container, user } = host({ ref: text })
        await user.dblClick(shownAs(container, text))
        expect(screen.getByRole('textbox')).toHaveValue(text)
        expect(selection()).toEqual(range)
        container.remove()
      }
    })

    it('keeps its text, and stays a reference, when switched to string', async () => {
      const { container, written, user } = host({ ref: '$data.user' })
      await chooseType(user, 1, 'string')
      expect(screen.getByRole('textbox')).toHaveValue('$data.user')
      await user.keyboard('{Enter}')
      expect(
        written.every((expression) => (expression as { ref: string }).ref === '$data.user')
      ).toBe(true)
      expect(shownAs(container, '$data.user')).toBeInTheDocument()
    })
  })

  describe('chosen in the type dropdown', () => {
    it('opens the input at `$data.`, with the caret at the end and the key kept', async () => {
      const { written, user } = host({ operator: 'round', value: 3 })
      await chooseType(user, 1, 'Data')
      expect(written).toEqual([])
      expect(screen.getByRole('textbox')).toHaveValue('$data.')
      expect(selection()).toEqual([6, 6])
      expect(keyLabel('value')).toBeInTheDocument()
      await user.keyboard('price{Enter}')
      expect(latest(written)).toEqual({ operator: 'round', value: '$data.price' })
    })

    it('puts the value back on Esc', async () => {
      const { container, written, user } = host({ operator: 'round', value: 3 })
      await chooseType(user, 1, 'Data')
      await user.keyboard('{Escape}')
      expect(written).toEqual([])
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(container.querySelector('.ft-reference')).toBeNull()
    })

    it("keeps a shorthand's `$name` key hidden", async () => {
      const { written, user } = host({ $not: true })
      await chooseType(user, 1, 'Data')
      expect(() => keyLabel('$not')).toThrow()
      await user.keyboard('ok{Enter}')
      expect(latest(written)).toEqual({ $not: '$data.ok' })
    })

    it('focuses the input again, with the new path selected, on another entry', async () => {
      const { written, user } = host({ operator: 'round', value: 3, vars: { price: 2 } })
      await chooseType(user, 1, 'Data')
      await user.selectOptions(screen.getByRole('combobox'), 'Variable')
      expect(screen.getByRole('textbox')).toHaveValue('$vars.price')
      expect(screen.getByRole('textbox')).toHaveFocus()
      expect(selection()).toEqual([6, 11])
      await user.selectOptions(screen.getByRole('combobox'), 'Data')
      expect(screen.getByRole('textbox')).toHaveFocus()
      expect(selection()).toEqual([6, 6])
      await user.keyboard('price{Enter}')
      expect(latest(written)).toMatchObject({ value: '$data.price' })
    })

    it('opens Variable with the var name selected', async () => {
      const { written, user } = host({ operator: 'round', value: 3, vars: { price: 2 } })
      await chooseType(user, 1, 'Variable')
      expect(screen.getByRole('textbox')).toHaveValue('$vars.price')
      expect(selection()).toEqual([6, 11])
      await user.keyboard('{Enter}')
      expect(latest(written)).toMatchObject({ value: '$vars.price' })
    })

    it('opens Element at the element, or at its `as` name, with the caret at the end', async () => {
      for (const [node, text] of [
        [{ operator: 'map', input: [1], each: 'x' }, '$element'],
        [{ operator: 'map', input: [1], as: 'item', each: 'x' }, '$item'],
      ] as const) {
        const { container, user } = host(node)
        const row = keyLabel('each').closest<HTMLElement>('.jer-value-main-row')!
        await user.click(within(row).getByRole('button', { name: 'Edit' }))
        await user.selectOptions(screen.getByRole('combobox'), 'Element')
        expect(screen.getByRole('textbox')).toHaveValue(text)
        expect(selection()).toEqual([text.length, text.length])
        container.remove()
      }
    })
  })
})
