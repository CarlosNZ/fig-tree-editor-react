import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode, createRef, useState, type ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { FigTree, coreOperators, defineOperator } from 'fig-tree-evaluator'
import {
  FigTreeEditor,
  defaultEditorTheme,
  type Evaluation,
  type FigTreeEditorHandle,
} from '../src'

// A host operator that waits until it is aborted, or 200ms
const wait = defineOperator({
  name: 'wait',
  category: 'other',
  description: 'Waits',
  parameters: {},
  evaluate: (_, { signal }) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve('waited'), 200)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(signal.reason as Error)
      })
    }),
})

// A host operator whose value is cached across evaluations
const once = defineOperator({
  name: 'once',
  category: 'other',
  description: 'Cached',
  parameters: {},
  evaluate: (_, { cache }) => cache.memo('once', () => Promise.resolve(42)),
})

const figTree = new FigTree({ operators: [coreOperators, [wait]] })

// A host holding the expression, in StrictMode, recording each start and
// each evaluation, as `start x` and `done x` by the row's first key. It can
// change the expression itself.
const host = (initial: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) => {
  const reports: string[] = []
  const evaluations: Evaluation[] = []
  const name = (path: (string | number)[]) => (path.length === 0 ? '(root)' : String(path[0]))
  let setOutside: (expression: unknown) => void = () => {}
  const Host = () => {
    const [expression, setExpression] = useState(initial)
    setOutside = setExpression
    return (
      <FigTreeEditor
        figTree={figTree}
        expression={expression}
        setExpression={setExpression}
        collapse={false}
        onEvaluateStart={({ path }) => reports.push(`start ${name(path)}`)}
        onEvaluate={(evaluation) => {
          reports.push(`${evaluation.status} ${name(evaluation.path)}`)
          evaluations.push(evaluation)
        }}
        {...props}
      />
    )
  }
  const rendered = render(<Host />, { wrapper: StrictMode })
  const latest = () => evaluations[evaluations.length - 1]
  const change = (expression: unknown) => act(() => setOutside(expression))
  return { ...rendered, reports, evaluations, latest, change }
}

// A node's Evaluate button, by its name
const nodeButton = (name: string) =>
  screen.getAllByRole('button').find((button) => button.textContent === name)!
// A reference's ▶, the only one in the tree
const referenceButton = () => document.querySelector<HTMLElement>('.ft-reference-evaluate')!

describe('evaluating', () => {
  it("evaluates a node from its button, with the host's evaluation data", async () => {
    const { reports, latest } = host({ x: { $plus: ['$data.a', 1] } }, { evaluationData: { a: 2 } })
    fireEvent.click(nodeButton('$plus'))
    await waitFor(() => expect(reports).toEqual(['start x', 'done x']))
    expect(latest()).toMatchObject({ path: ['x'], mode: 'report', result: 3 })
  })

  it('evaluates a node in the scope around it, one value per element', async () => {
    const { latest } = host({
      vars: { rate: 2 },
      operator: 'map',
      input: [1, 2],
      each: { $multiply: ['$element', '$vars.rate'] },
    })
    fireEvent.click(nodeButton('$multiply'))
    await waitFor(() => expect(latest()).toMatchObject({ path: ['each'], result: [2, 4] }))
  })

  it('evaluates a reference from its ▶', async () => {
    const { latest } = host({ a: '$data.name' }, { evaluationData: { name: 'Ada' } })
    fireEvent.click(referenceButton())
    await waitFor(() => expect(latest()).toMatchObject({ path: ['a'], result: 'Ada' }))
  })

  it('evaluates the whole of a plain root from its bar', async () => {
    const { container, latest } = host({ title: 'Sum', n: { $plus: [1, 2] } })
    fireEvent.click(within(container.querySelector('.ft-root-bar')!).getByRole('button'))
    await waitFor(() =>
      expect(latest()).toMatchObject({ path: [], result: { title: 'Sum', n: 3 } })
    )
  })

  it('evaluates in throw mode where the host asks', async () => {
    const { latest } = host({ x: { $divide: [1, 0] } }, { evaluationMode: 'throw' })
    fireEvent.click(nodeButton('$divide'))
    await waitFor(() => expect(latest()).toMatchObject({ mode: 'throw', status: 'failed' }))
  })

  describe('while it runs', () => {
    const slow = { x: { $plus: [{ operator: 'wait' }, '!'] }, y: { $plus: [1, 2] } }

    it('shows a spinner in place of the ▶, the button keeping its name', async () => {
      host(slow)
      fireEvent.click(nodeButton('$plus'))
      const button = nodeButton('$plus')
      expect(button).toHaveAttribute('aria-busy', 'true')
      expect(button.querySelector('.ft-spinner')).toBeInTheDocument()
      await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'))
      expect(button.querySelector('.ft-spinner')).toBeNull()
    })

    it('is cancelled by a second click, at once', async () => {
      const { reports } = host(slow)
      fireEvent.click(nodeButton('$plus'))
      fireEvent.click(nodeButton('$plus'))
      expect(reports).toEqual(['start x', 'cancelled x'])
      await new Promise((resolve) => setTimeout(resolve, 250))
      expect(reports).toEqual(['start x', 'cancelled x'])
    })

    it('is cancelled by starting another', async () => {
      const { reports } = host(slow)
      const [x, y] = screen
        .getAllByRole('button')
        .filter(({ textContent }) => textContent === '$plus')
      fireEvent.click(x)
      fireEvent.click(y)
      await waitFor(() => expect(reports).toEqual(['start x', 'cancelled x', 'start y', 'done y']))
    })

    it('is cancelled as the editor goes, and reported so', () => {
      const { reports, unmount } = host(slow)
      fireEvent.click(nodeButton('$plus'))
      unmount()
      expect(reports).toEqual(['start x', 'cancelled x'])
    })

    it("labels a reference's ▶ as cancelling", () => {
      host({ a: { $plus: [{ operator: 'wait' }, 1] }, b: '$data.x' })
      fireEvent.click(referenceButton())
      expect(referenceButton()).toHaveAccessibleName('Cancel evaluation')
      expect(referenceButton()).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe("where it can't run", () => {
    const card = (button: HTMLElement) =>
      button.closest('.ft-hover-card-anchor')!.querySelector('.ft-hover-card-alert')

    it('is dimmed, ignores a plain click, and says why on hover', () => {
      const { reports } = host({ x: { $plus: [1, { $upper: 5 }] } })
      const button = nodeButton('$plus')
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveClass('ft-evaluate-blocked')
      expect(card(button)).toHaveTextContent('Fix the error to evaluate this')
      fireEvent.click(button)
      expect(reports).toEqual([])
    })

    it('counts errors in the vars block around it', () => {
      host({
        vars: { a: { $upper: 5 }, b: { $lower: 6 } },
        value: { $plus: [1, 2] },
      })
      expect(card(nodeButton('$plus'))).toHaveTextContent('Fix 2 errors to evaluate this')
    })

    it('says so inside an iterator with no input', () => {
      host({ operator: 'map', inptu: [1], each: { $upper: '$element' } })
      expect(card(nodeButton('$upper'))).toHaveTextContent(
        "It's inside an iterator with no input to go over"
      )
    })

    it('still respells on a modifier-click', () => {
      const { container } = host({ x: { operator: 'plus', values: [1, { $upper: 5 }] } })
      fireEvent.click(nodeButton('plus'), { metaKey: true })
      expect(container).toHaveTextContent('+')
      expect(nodeButton('+')).toHaveAttribute('aria-disabled', 'true')
    })

    it("gives a reference's ▶ a card with the reason only", () => {
      host({ vars: { bad: { $upper: 5 } }, value: '$vars.bad' })
      const button = referenceButton()
      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(card(button)).toHaveTextContent('Fix the error to evaluate this')
    })
  })

  it("hides the button's card after a click, until the pointer leaves", () => {
    host({ x: { $plus: [1, 2] } })
    const anchor = nodeButton('$plus').closest('.ft-hover-card-anchor')!
    fireEvent.click(nodeButton('$plus'))
    expect(anchor).toHaveAttribute('data-clicked')
    fireEvent.pointerLeave(anchor)
    expect(anchor).not.toHaveAttribute('data-clicked')
  })

  describe('how it ran', () => {
    // How a node's button, or a reference's ▶, shows its row ran, if it does
    const ran = (button: HTMLElement) =>
      button.querySelector('[data-run]')?.getAttribute('data-run')
    const marks = () => document.querySelectorAll('[data-run]').length
    // A node's border, which json-edit-react's theme draws round its rows
    const border = (button: HTMLElement) =>
      (button.closest('.jer-collection-inner') as HTMLElement).style
    const done = async (reports: string[], count: number) =>
      waitFor(() =>
        expect(reports.filter((report) => !report.startsWith('start'))).toHaveLength(count)
      )

    it('marks each node and reference that took part, and leaves the rest', async () => {
      const { reports } = host(
        { x: { $plus: [{ $multiply: [2, 3] }, '$data.a'] }, y: { $plus: [1, 1] } },
        { evaluationData: { a: 1 } }
      )
      const [x, y] = screen
        .getAllByRole('button')
        .filter(({ textContent }) => textContent === '$plus')
      fireEvent.click(x)
      await done(reports, 1)
      expect(ran(x)).toBe('value')
      expect(ran(nodeButton('$multiply'))).toBe('value')
      expect(ran(referenceButton())).toBe('value')
      expect(ran(y)).toBeUndefined()
      expect(border(x)).toMatchObject({ borderWidth: '2px' })
      expect(border(x).borderColor).toBe(toRgb(defaultEditorTheme.runValue))
      expect(border(y)).toMatchObject({ borderWidth: '1px' })
    })

    it('marks a failure, every node it failed, and a node whose fallback caught one', async () => {
      const { container, reports } = host({
        caught: { $divide: [1, 0], fallback: 0 },
        failed: { $plus: [{ $divide: [2, 0] }, 1] },
      })
      fireEvent.click(within(container.querySelector('.ft-root-bar')!).getByRole('button'))
      await done(reports, 1)
      const [caught, inner] = screen
        .getAllByRole('button')
        .filter(({ textContent }) => textContent === '$divide')
      expect(ran(caught)).toBe('fallback')
      expect(border(caught).borderColor).toBe(toRgb(defaultEditorTheme.runFallback))
      expect(ran(inner)).toBe('failed')
      expect(ran(nodeButton('$plus'))).toBe('failed')
      expect(border(inner).borderColor).toBe(toRgb(defaultEditorTheme.runFailed))
      // Done, holding the failure's null
      expect(ran(within(container.querySelector('.ft-root-bar')!).getByRole('button'))).toBe(
        'value'
      )
    })

    it('leaves a row that never ran its ▶, in a grey border', async () => {
      const { reports } = host({
        operator: 'if',
        condition: true,
        then: { $plus: [1, 1] },
        else: { $subtract: [2, 1] },
      })
      fireEvent.click(nodeButton('if'))
      await done(reports, 1)
      expect(ran(nodeButton('$plus'))).toBe('value')
      expect(ran(nodeButton('$subtract'))).toBeUndefined()
      expect(border(nodeButton('$subtract')).borderColor).toBe(toRgb(defaultEditorTheme.runSkipped))
    })

    it("colours a collapsed node's summary by how it ran", async () => {
      const editorRef = createRef<FigTreeEditorHandle>()
      const { container, reports } = host(
        { x: { $plus: [1, { $multiply: [2, 0.5] }] } },
        { editorRef }
      )
      fireEvent.click(nodeButton('$plus'))
      await done(reports, 1)
      act(() => {
        editorRef.current!.collapse({
          path: ['x', '$plus', 1],
          collapsed: true,
          includeChildren: false,
        })
      })
      const summary = [
        ...container.querySelectorAll<HTMLElement>('.jer-collection-item-count'),
      ].find(({ textContent }) => textContent?.includes('Shorthand: $multiply'))!
      expect(summary.style.color).toBe(toRgb(defaultEditorTheme.runValue))
    })

    it('adds a bolt where the value came from the cache', async () => {
      const cached = new FigTree({ operators: [coreOperators, [once]], useCache: true })
      const { reports } = host({ x: { operator: 'once' } }, { figTree: cached })
      fireEvent.click(nodeButton('once'))
      await done(reports, 1)
      expect(nodeButton('once').querySelector('[data-run="cached"]')).toBeNull()
      fireEvent.click(nodeButton('once'))
      await done(reports, 2)
      expect(ran(nodeButton('once'))).toBe('value')
      expect(nodeButton('once').querySelector('[data-run="cached"]')).toBeInTheDocument()
    })

    describe('the marks go', () => {
      const slow = { x: { $plus: [1, 2] }, y: { $plus: [{ operator: 'wait' }, '!'] } }

      it('as another evaluation starts', async () => {
        const { reports } = host(slow)
        fireEvent.click(nodeButton('$plus'))
        await done(reports, 1)
        expect(marks()).toBeGreaterThan(0)
        const [, y] = screen
          .getAllByRole('button')
          .filter(({ textContent }) => textContent === '$plus')
        fireEvent.click(y)
        expect(marks()).toBe(0)
        await done(reports, 2)
      })

      it("as an edit starts, the toolbar's opening included", async () => {
        const editorRef = createRef<FigTreeEditorHandle>()
        const { reports } = host({ x: { operator: 'plus', values: [1, 2] } }, { editorRef })
        fireEvent.click(nodeButton('plus'))
        await done(reports, 1)
        fireEvent.click(screen.getByRole('button', { name: 'Open toolbar' }))
        expect(marks()).toBe(0)
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        fireEvent.click(nodeButton('plus'))
        await done(reports, 2)
        expect(marks()).toBeGreaterThan(0)
        act(() => {
          editorRef.current!.startEdit({ path: ['x', 'values', 0] })
        })
        expect(marks()).toBe(0)
      })

      it('as the expression changes from outside the editor', async () => {
        const { reports, change } = host({ x: { $plus: [1, 2] } })
        fireEvent.click(nodeButton('$plus'))
        await done(reports, 1)
        expect(marks()).toBeGreaterThan(0)
        change({ x: { $plus: [1, 2] } })
        expect(marks()).toBe(0)
      })

      it('leaving nothing behind a cancelled evaluation', async () => {
        const { reports } = host(slow)
        const [, y] = screen
          .getAllByRole('button')
          .filter(({ textContent }) => textContent === '$plus')
        fireEvent.click(y)
        fireEvent.click(y)
        expect(reports).toEqual(['start y', 'cancelled y'])
        await new Promise((resolve) => setTimeout(resolve, 250))
        expect(marks()).toBe(0)
      })

      it("and aren't drawn where the expression changed while it ran", async () => {
        const { reports, change } = host(slow)
        const [, y] = screen
          .getAllByRole('button')
          .filter(({ textContent }) => textContent === '$plus')
        fireEvent.click(y)
        change({ ...slow })
        await done(reports, 1)
        expect(reports).toEqual(['start y', 'done y'])
        expect(marks()).toBe(0)
      })
    })
  })
})

// A colour as the DOM gives an inline style's back
const toRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}
