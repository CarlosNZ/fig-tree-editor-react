import { render, screen, within } from '@testing-library/react'
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

  it('is followed by its ▶', () => {
    const { container } = editor({ ref: '$data.user' })
    const reference = container.querySelector<HTMLElement>('.ft-reference')!
    expect(within(reference).getByRole('button', { name: 'Evaluate' })).toBeInTheDocument()
  })

  it("sits on a shorthand's line", () => {
    const { container } = editor({ $not: '$data.user' })
    expect(
      container.querySelector('.ft-display-bar-value')!.querySelector('.ft-reference')
    ).toHaveTextContent('$data.user')
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
