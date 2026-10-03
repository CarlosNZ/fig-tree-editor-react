import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, createRef, useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { FigTreeEditor, type FigTreeEditorHandle } from '../src'
import { revealRow } from '../src/revealRow'
import { keyLabel } from './queries'

const figTree = new FigTree({ operators: [coreOperators] })

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

const area = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('.ft-message-container')
const lines = () => screen.queryAllByRole('listitem')
const header = () => screen.getByRole('button', { name: /^Messages/ })

describe('the messages area', () => {
  it('shows nothing for a valid expression', () => {
    const { container } = editor({ $plus: [1, 2] })
    expect(area(container)).toBeNull()
  })

  it('lists each issue with its severity, the row it marks and its message', () => {
    editor({ $plus: [1, '$vars.missing', '$typo'] })
    expect(lines()).toHaveLength(2)
    const [error, warning] = lines()
    expect(error).toHaveTextContent('error$plus[1]')
    expect(error).toHaveTextContent("no var 'missing' is declared in scope")
    expect(warning).toHaveTextContent('warning$plus[2]')
  })

  it('lists in tree order', () => {
    editor({
      age: { $round: { value: { operator: 'upper', valeu: 'x' } } },
      rounded: { $round: [[1]] },
    })
    expect(lines().map((line) => line.querySelector('.ft-message-path')!.textContent)).toEqual([
      'age.$round.value',
      'age.$round.value.valeu',
      'rounded.$round[0]',
    ])
  })

  it('labels an issue at the root', () => {
    editor({ operator: 'plsu' })
    expect(lines()[0]).toHaveTextContent("(root)'plsu' names no registered operator")
  })

  it('follows the expression', () => {
    const { container, rerender } = editor({ operator: 'plsu' })
    expect(lines()).toHaveLength(1)
    rerender(
      <FigTreeEditor figTree={figTree} expression={{ $plus: [1, 2] }} setExpression={vi.fn()} />
    )
    expect(area(container)).toBeNull()
  })

  it('counts each severity in its header', () => {
    editor({ greeting: { $buildString: ['Hi %1 %3 %4', 'Ada', 'Lovelace'] }, x: { $upper: 5 } })
    const counts = [...header().querySelectorAll('.ft-severity')].map((pill) => pill.textContent)
    expect(counts).toEqual(['1 error', '2 warnings'])
  })

  it('folds away from its header, and opens again', () => {
    editor({ operator: 'plsu' })
    expect(header()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(header())
    expect(header()).toHaveAttribute('aria-expanded', 'false')
    expect(lines()).toHaveLength(0)
    fireEvent.click(header())
    expect(lines()).toHaveLength(1)
  })

  it('scrolls beyond the maximum height, 15em by default', () => {
    const { container, unmount } = editor({ operator: 'plsu' })
    // Read from the element's own style, as jsdom computes no `em`
    expect(container.querySelector<HTMLElement>('.ft-messages-list')!.style.maxHeight).toBe('15em')
    unmount()
    const { container: other } = editor({ operator: 'plsu' }, { messagesMaxHeight: 120 })
    expect(other.querySelector('.ft-messages-list')).toHaveStyle({ maxHeight: '120px' })
  })

  it('is hidden by a maximum height of 0, header and all', () => {
    const { container } = editor({ operator: 'plsu' }, { messagesMaxHeight: 0 })
    expect(area(container)).toBeNull()
  })

  it("colours each severity from the editor's theme", () => {
    editor(
      { greeting: { $buildString: ['Hi %1 %3', 'Ada', 'Lovelace'] }, x: { $upper: 5 } },
      { editorTheme: { error: 'rgb(1, 2, 3)', warning: 'rgb(4, 5, 6)' } }
    )
    const [warning, error] = lines().map((line) => line.querySelector<HTMLElement>('.ft-severity')!)
    expect(warning).toHaveStyle({ backgroundColor: 'rgb(4, 5, 6)' })
    expect(error).toHaveStyle({ backgroundColor: 'rgb(1, 2, 3)' })
  })
})

describe('revealing a row', () => {
  afterEach(() => vi.restoreAllMocks())

  // jsdom does no layout, so every element is placed where the test says:
  // below the window, or in it
  const placeRows = (top: number) =>
    vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ top, bottom: top + 20 } as DOMRect)
  const scrolled = () => vi.spyOn(Element.prototype, 'scrollIntoView')
  const reveal = (path: string) => fireEvent.click(screen.getByRole('button', { name: path }))
  // The element each scroll was made on
  const scrolledTo = (spy: ReturnType<typeof scrolled>) => spy.mock.contexts as HTMLElement[]

  it('opens the rows above it, then scrolls its line to the middle', async () => {
    editor({ age: { operator: 'if', condition: true, thn: 'Adult' } }, { collapse: 1 })
    placeRows(2000)
    const scroll = scrolled()
    const chevron = () =>
      keyLabel('age').closest('.jer-collection-header-row')!.querySelector('button')
    expect(chevron()).toHaveAttribute('aria-expanded', 'false')
    reveal('age.thn')
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(chevron()).toHaveAttribute('aria-expanded', 'true')
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    const [line] = scrolledTo(scroll)
    expect(line).toHaveClass('jer-value-main-row')
    expect(line).toHaveTextContent('thn')
  })

  it('opens a collection itself, and scrolls to its header line', async () => {
    editor({ rounded: { operator: 'round', value: [1, 2] } }, { collapse: 1 })
    placeRows(2000)
    const scroll = scrolled()
    const chevron = (key: string) =>
      keyLabel(key).closest('.jer-collection-header-row')!.querySelector('button')
    reveal('rounded.value')
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(chevron('rounded')).toHaveAttribute('aria-expanded', 'true')
    expect(chevron('value')).toHaveAttribute('aria-expanded', 'true')
    const [line] = scrolledTo(scroll)
    expect(line).toHaveClass('jer-collection-header-row')
    expect(line).toHaveTextContent('value')
  })

  it("scrolls to the nearest marked row above one the editor doesn't draw", async () => {
    // Every row with an error or a warning is marked, so no message names an
    // unmarked row, and one is revealed directly
    const { container } = editor({ $plus: [1, 2] })
    placeRows(2000)
    const scroll = scrolled()
    revealRow(container.querySelector('.ft-outer-container')!, ['$plus', 0], vi.fn())
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(scrolledTo(scroll)[0]).toHaveClass('ft-display-bar')
  })

  it('leaves the page alone when the row is in view', async () => {
    editor({ operator: 'round', value: [1, 2] })
    placeRows(100)
    const scroll = scrolled()
    reveal('value')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(scroll).not.toHaveBeenCalled()
  })

  it("gives the host json-edit-react's handle, with reveal, set once", () => {
    const ref = createRef<FigTreeEditorHandle>()
    editor({ $plus: [1, 2] }, { editorRef: ref })
    expect(ref.current?.collapse).toBeTypeOf('function')
    expect(ref.current?.reveal).toBeTypeOf('function')
    const callback = vi.fn()
    const { rerender } = editor({ $plus: [1, 2] }, { editorRef: callback })
    rerender(
      <FigTreeEditor
        figTree={figTree}
        expression={{ $plus: [1, 3] }}
        setExpression={vi.fn()}
        editorRef={callback}
      />
    )
    expect(callback).toHaveBeenCalledTimes(1)
    const [handle] = callback.mock.calls[0] as [FigTreeEditorHandle]
    expect(handle.startEdit({ path: ['$plus', 0] })).toBe(true)
  })

  it("reveals a row from the host's handle, and reports a path that's gone", async () => {
    const ref = createRef<FigTreeEditorHandle>()
    editor({ a: { b: [1, { $upper: 5 }] } }, { editorRef: ref, collapse: 1 })
    expect(screen.queryByText('5')).toBeNull()
    let result: unknown
    act(() => {
      result = ref.current!.reveal({ path: ['a', 'b', 1, '$upper'] })
    })
    expect(result).toBe(true)
    await waitFor(() => expect(screen.getByText('5')).toBeInTheDocument())
    expect(ref.current!.reveal({ path: ['a', 'nope'] })).toBe('PATH_NOT_FOUND')
  })
})

describe('quick fixes', () => {
  // A host holding the expression, so each write comes back as the editor's
  // next expression, in StrictMode
  const host = (initial: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) => {
    const written: unknown[] = []
    const onUpdate = vi.fn()
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
          onUpdate={onUpdate}
          {...props}
        />
      )
    }
    const { container } = render(<Host />, { wrapper: StrictMode })
    return { container, written, onUpdate, user: userEvent.setup() }
  }
  const latest = (written: unknown[]) => written[written.length - 1]
  const fix = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))

  it("are offered in a column of their own, beside the line's text", () => {
    editor({ operator: 'if', condition: true, thn: 'Adult' })
    const line = lines().find((line) => line.textContent.includes("'thn'"))!
    expect([...line.children].map(({ className }) => className)).toEqual([
      'ft-message-content',
      'ft-message-fixes',
    ])
    expect(
      within(line)
        .getAllByRole('button')
        .slice(1)
        .map((button) => button.textContent)
    ).toEqual(['Rename to then', 'Remove'])
  })

  it('write the fixed expression, completed, and not through onUpdate', () => {
    const { written, onUpdate } = host({ operator: 'if', condition: true, thn: 'Adult' })
    fix('Rename to then')
    expect(latest(written)).toEqual({ operator: 'if', condition: true, then: 'Adult' })
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Rename to then' })).toBeNull()
  })

  it('let the fill-in step seed a parameter a removed typo held back', () => {
    const { written } = host({ operator: 'if', condition: true, thn: 'Adult' })
    fix('Remove')
    const result = latest(written) as Record<string, unknown>
    expect(Object.keys(result)).toEqual(['operator', 'condition', 'then'])
    expect(result.then).not.toBe('Adult')
  })

  it('change an unknown operator as the picker would', () => {
    const { written } = host({ operator: 'plsu', values: [1], extra: 2, fallback: 0 })
    fix('Change to plus')
    expect(latest(written)).toEqual({ operator: 'plus', values: [1], fallback: 0 })
  })

  it('make an object a shorthand node by renaming its `$` key', () => {
    const { written } = host({ condition: { $graeterThan: [1, 2] } })
    fix('Rename to $greaterThan')
    expect(latest(written)).toEqual({ condition: { $greaterThan: [1, 2] } })
    expect(lines()).toHaveLength(0)
  })

  describe('with an edit open', () => {
    // In the fill-in step's order, so nothing is written as it loads
    const expression = { operator: 'if', condition: true, else: 'Child', thn: 'Adult' }

    it('commit it first, keeping its changes, and apply to what it produced', async () => {
      const { written, user } = host(expression)
      await user.dblClick(screen.getByText('"Child"'))
      const input = screen.getByRole('textbox')
      await user.clear(input)
      await user.type(input, 'Kid')
      fix('Rename to then')
      expect(written).toEqual([{ operator: 'if', condition: true, then: 'Adult', else: 'Kid' }])
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('apply as they are when the edit changed nothing', async () => {
      const { written, user } = host(expression)
      await user.dblClick(screen.getByText('"Child"'))
      fix('Rename to then')
      expect(latest(written)).toEqual({
        operator: 'if',
        condition: true,
        then: 'Adult',
        else: 'Child',
      })
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it("leave an edit whose raw JSON doesn't parse open, and don't apply", async () => {
      const { container, written, user } = host(expression)
      // json-edit-react's ✎ on the root node
      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      const textarea = container.querySelector('textarea')!
      fireEvent.change(textarea, { target: { value: '{ not json' } })
      fix('Rename to then')
      expect(written).toHaveLength(0)
      expect(container.querySelector('textarea')).toBeInTheDocument()
      // The waiting fix went with the refused commit, so the edit commits on
      // its own later
      fireEvent.change(textarea, {
        target: { value: JSON.stringify({ ...expression, else: 'Kid' }) },
      })
      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      expect(latest(written)).toEqual({ ...expression, else: 'Kid' })
    })

    it("still call the host's onEditEvent", async () => {
      const onEditEvent = vi.fn()
      const { user } = host(expression, { onEditEvent })
      await user.dblClick(screen.getByText('"Child"'))
      fix('Rename to then')
      expect(onEditEvent.mock.calls.map(([{ event }]) => event as string)).toEqual([
        'startEdit',
        'submitEdit',
        'commitEdit',
      ])
    })
  })
})

describe('filled-in values', () => {
  // A host holding the expression, so each write comes back as the editor's
  // next expression, in StrictMode, with a way to change it as an undo would
  const host = (initial: unknown) => {
    const written: unknown[] = []
    let replace: (expression: unknown) => void = () => {}
    const Host = () => {
      const [expression, setExpression] = useState(initial)
      replace = setExpression
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
    render(<Host />, { wrapper: StrictMode })
    return {
      written,
      replace: (next: unknown) => act(() => replace(next)),
      user: userEvent.setup(),
    }
  }
  const added = () => lines().filter((line) => line.textContent.startsWith('added'))
  const SEED = '"The condition is true"' // `if.then`'s, as drawn

  it('lists each value added to an expression as it arrives, and counts them', () => {
    host({ x: { operator: 'if', condition: true } })
    expect(added()).toHaveLength(1)
    expect(added()[0]).toHaveTextContent("addedx.thenAdded 'then', which 'if' requires")
    expect(within(added()[0]).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    const counts = [...header().querySelectorAll('.ft-severity')].map((pill) => pill.textContent)
    expect(counts).toEqual(['1 added'])
  })

  it('leaves out a value the fill-in step adds after an edit', () => {
    host({ operator: 'if', condition: true, thn: 'Adult' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByText(SEED)).toBeInTheDocument()
    expect(added()).toHaveLength(0)
  })

  it('are dismissed one at a time, or all at once where there is more than one', () => {
    host({ a: { operator: 'if', condition: true }, b: { operator: 'if', condition: false } })
    expect(added()).toHaveLength(2)
    fireEvent.click(within(added()[0]).getByRole('button', { name: 'Dismiss' }))
    expect(added().map((line) => line.querySelector('.ft-message-path')!.textContent)).toEqual([
      'b.then',
    ])
    expect(screen.queryByRole('button', { name: 'Dismiss all' })).toBeNull()
  })

  it('are dismissed all at once from the header', () => {
    const { written } = host({
      a: { operator: 'if', condition: true },
      b: { operator: 'if', condition: false },
    })
    const writes = written.length
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss all' }))
    expect(lines()).toHaveLength(0)
    // Dismissing writes nothing
    expect(written).toHaveLength(writes)
  })

  it('clear when their row is edited, its value kept or not', async () => {
    const { user } = host({ a: { operator: 'if', condition: true } })
    await user.dblClick(screen.getByText(SEED))
    await user.keyboard('{Enter}')
    expect(added()).toHaveLength(0)
  })

  it('stay when an edit of their row is cancelled', async () => {
    const { user } = host({ a: { operator: 'if', condition: true } })
    await user.dblClick(screen.getByText(SEED))
    await user.keyboard('{Escape}')
    expect(added()).toHaveLength(1)
  })

  it('stay through an edit of the node holding the row that leaves the value', async () => {
    const { user } = host({ operator: 'if', condition: true })
    // json-edit-react's ✎ on the root node, confirmed as it is
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(added()).toHaveLength(1)
  })

  describe('the marker', () => {
    afterEach(() => {
      vi.useRealTimers()
    })
    // The `then` row's line, which the marker highlights
    const thenRow = () => screen.getByText(SEED).closest<HTMLElement>('.jer-value-main-row')!.style

    it('highlights each row as its value is added, then fades, then goes', () => {
      vi.useFakeTimers()
      host({ operator: 'if', condition: true })
      expect(thenRow().background).toContain('color-mix')
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(thenRow().background).toBe('')
      expect(thenRow().transition).toContain('background-color')
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(thenRow().transition).toBe('')
      expect(added()).toHaveLength(1)
    })

    it('leaves the other rows alone', () => {
      vi.useFakeTimers()
      host({ operator: 'if', condition: true })
      const condition = screen.getByText('true').closest<HTMLElement>('.jer-value-main-row')!
      expect(condition.style.background).toBe('')
    })

    it('goes at once with its line', () => {
      vi.useFakeTimers()
      host({ operator: 'if', condition: true })
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(thenRow().background).toBe('')
    })
  })

  it('hide while their row holds something else, and come back with the value', () => {
    const { replace } = host({ operator: 'if', condition: true })
    replace({ operator: 'if', condition: true, then: 'Yes' })
    expect(added()).toHaveLength(0)
    replace({ operator: 'if', condition: true, then: 'The condition is true' })
    expect(added()).toHaveLength(1)
  })
})

describe("the editor's outer container", () => {
  const outer = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.ft-outer-container')!

  it('takes the width the host gives the editor, and the tree fills it', () => {
    const { container } = editor({ operator: 'plsu' }, { minWidth: '90%', maxWidth: 800 })
    expect(outer(container)).toHaveStyle({ minWidth: '90%', maxWidth: '800px' })
    const tree = container.querySelector('.jer-editor-container')
    expect(tree).toHaveStyle({ minWidth: '0px', maxWidth: '100%' })
    expect(tree!.parentElement).toBe(outer(container))
    expect(outer(container).lastElementChild).toBe(area(container))
  })

  it("carries the host's id, so a host can reach one instance's parts", () => {
    const { container } = editor({ operator: 'plsu' }, { id: 'rules' })
    expect(outer(container)).toHaveAttribute('id', 'rules')
    expect(container.querySelectorAll('#rules')).toHaveLength(1)
    expect(container.querySelector('#rules > .jer-editor-container')).not.toBeNull()
    expect(container.querySelector('#rules > .ft-message-container')).not.toBeNull()
  })

  it("takes json-edit-react's own sizes where the host gives none, in ems", () => {
    const { container } = editor({ $plus: [1, 2] }, { baseFontSize: 14 })
    // Read from the element's own style, as jsdom computes no `min()`
    const { style } = outer(container)
    expect([style.minWidth, style.maxWidth, style.fontSize]).toEqual([
      '15.625em',
      'min(37.5em, 90vw)',
      '14px',
    ])
  })
})
