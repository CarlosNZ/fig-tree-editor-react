import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FigTreeEditor } from '../src'
import { figTree } from './fixtures'

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

const notes = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('.ft-comment .jer-value-string'),
]
const noteTexts = (container: HTMLElement) => notes(container).map(({ textContent }) => textContent)

// A comment of lines' own row: its edit tools, and its chevron
const linesRow = (container: HTMLElement) =>
  notes(container)[0]
    .closest<HTMLElement>('.jer-value-component')!
    .parentElement!.closest<HTMLElement>('.jer-collection-component')!
const linesHeader = (container: HTMLElement) =>
  linesRow(container).querySelector<HTMLElement>(':scope > .jer-collection-header-row')!

describe('a comment', () => {
  it('shows as a note: no key, no quotes, never cut short, in the comment colour', () => {
    const long = 'A rather long note about this node. '.repeat(5).trim()
    const { container } = render(
      <FigTreeEditor
        figTree={figTree}
        expression={{ '//': long, $plus: [1] }}
        setExpression={vi.fn()}
        editorTheme={{ comment: 'rgb(1, 2, 3)' }}
      />
    )
    expect(long.length).toBeGreaterThan(100) // the editor's stringTruncateLength
    expect(noteTexts(container)).toEqual([long])
    expect(notes(container)[0]).toHaveStyle({ color: 'rgb(1, 2, 3)' })
    expect(screen.queryByText('//')).not.toBeInTheDocument()
  })

  it("leads with the note icon, in the block colour, once for a comment's lines", () => {
    const icons = (container: HTMLElement) => [
      ...container.querySelectorAll<SVGElement>('.ft-comment .ft-note-icon'),
    ]
    const { container: note } = render(
      <FigTreeEditor
        figTree={figTree}
        expression={{ '//': 'A note', $plus: [1] }}
        setExpression={vi.fn()}
        editorTheme={{ commentBlock: 'rgb(1, 2, 3)' }}
      />
    )
    expect(icons(note)).toHaveLength(1)
    expect(icons(note)[0]).toHaveStyle({ color: 'rgb(1, 2, 3)', visibility: 'visible' })
    // Each line keeps its width, so the lines line up, but only the first
    // shows it
    const { container: lines } = host({ '//': ['One', 'Two', 'Three'], $plus: [1] })
    expect(icons(lines).map((icon) => icon.style.visibility)).toEqual(['', 'hidden', 'hidden'])
  })

  it('shows each line of a comment of lines as a note, quoted', () => {
    const { container } = host({ '//': ['One', '$data.x'], $plus: [1] })
    expect(noteTexts(container)).toEqual(['One', '$data.x'])
    expect(container.querySelector('.ft-reference')).not.toBeInTheDocument()
  })

  it("edits in json-edit-react's own input", async () => {
    const { container, written, user } = host({ '//': 'Old', $plus: [1] })
    await user.dblClick(notes(container)[0])
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'New{Enter}')
    expect(latest(written)).toEqual({ '//': 'New', $plus: [1] })
  })

  it('becomes a comment of lines through the type dropdown', async () => {
    const { container, written, user } = host({ '//': 'One', $plus: [1] })
    const row = notes(container)[0].closest<HTMLElement>('.jer-value-main-row')!
    await user.click(within(row).getByRole('button', { name: 'Edit' }))
    await user.selectOptions(screen.getByRole('combobox'), 'array')
    expect(latest(written)).toEqual({ '//': ['One'], $plus: [1] })
    expect(noteTexts(container)).toEqual(['One'])
  })

  it('adds a line as a placeholder note, closed', async () => {
    const { container, written, user } = host({ '//': ['One'], $plus: [1] })
    await user.click(within(linesHeader(container)).getByRole('button', { name: 'Add' }))
    expect(latest(written)).toEqual({ '//': ['One', 'Comment...'], $plus: [1] })
    expect(noteTexts(container)).toEqual(['One', 'Comment...'])
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('starts as a placeholder note when added to a plain object, and not in quoted content', () => {
    const typeKey = (key: string) => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: key } })
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    }
    const plain = host({ a: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    typeKey('//')
    expect(latest(plain.written)).toEqual({ a: 1, '//': 'Comment...' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('starts as anything in quoted content', () => {
    const quoted = host({ operator: 'literal', value: { a: 1 } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add' }).at(-1)!)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '//' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(latest(quoted.written)).toEqual({
      operator: 'literal',
      value: { a: 1, '//': 'Replace me' },
    })
  })

  it("never starts collapsed, over the host's collapse", () => {
    const expanded = (row: HTMLElement) =>
      row
        .querySelector(':scope > .jer-collection-header-row .jer-collapse-icon')!
        .getAttribute('aria-expanded')
    for (const collapse of [1, ({ level }: { level: number }) => level > 0]) {
      const { container, unmount } = render(
        <FigTreeEditor
          figTree={figTree}
          expression={{ '//': ['One', 'Two'], $plus: [1, 2] }}
          setExpression={vi.fn()}
          collapse={collapse}
        />
      )
      expect(expanded(linesRow(container))).toBe('true')
      // The argument list beside it, at the same level, collapses
      const list = container.querySelectorAll<HTMLElement>('.jer-collection-component')[2]
      expect(expanded(list)).toBe('false')
      unmount()
    }
  })
})
