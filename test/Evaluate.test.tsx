import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode, useState, type ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { FigTree, coreOperators, defineOperator } from 'fig-tree-evaluator'
import { FigTreeEditor, type Evaluation } from '../src'

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

const figTree = new FigTree({ operators: [coreOperators, [wait]] })

// A host holding the expression, in StrictMode, recording each start and
// each evaluation, as `start x` and `done x` by the row's first key
const host = (initial: unknown, props: Partial<ComponentProps<typeof FigTreeEditor>> = {}) => {
  const reports: string[] = []
  const evaluations: Evaluation[] = []
  const name = (path: (string | number)[]) => (path.length === 0 ? '(root)' : String(path[0]))
  const Host = () => {
    const [expression, setExpression] = useState(initial)
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
  return { ...rendered, reports, evaluations, latest }
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
})
