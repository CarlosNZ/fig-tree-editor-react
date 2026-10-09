import { describe, expect, it, vi } from 'vitest'
import { FigTree, coreOperators, defineOperator } from 'fig-tree-evaluator'
import { classify } from '../src/classify'
import {
  createEvaluator,
  evaluateSubTree,
  type Evaluation,
  type EvaluatorHandlers,
  type PreparedEvaluation,
} from '../src/evaluation'
import { type Path } from '../src/paths'
import { buildSubTree } from '../src/subTree'

// A host operator that waits until it is aborted, or 200ms
const wait = defineOperator({
  name: 'wait',
  category: 'other',
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

const figTree = new FigTree({
  operators: [coreOperators, [wait]],
  fragments: {
    // Its body fails, and catches its own failure
    risky: { expression: { $divide: [1, 0], fallback: 'caught in the body' } },
    broken: { expression: { $divide: [1, 0] } },
  },
})
const registry = { operators: figTree.getOperators(), fragments: figTree.getFragments() }

const FAILING = { $divide: [1, 0] } // a non-finite result, at run time

const evaluate = (
  expression: unknown,
  path: Path,
  options: Partial<Parameters<typeof evaluateSubTree>[3]> = {}
) => {
  const subTree = buildSubTree(expression, path, {
    classification: classify(expression, registry),
    operators: registry.operators,
  })!
  return evaluateSubTree(figTree, path, subTree, options)
}

// The failure as [its path in the tree, its message's start]
const failed = ({ failure }: Evaluation) => failure && [failure.path, failure.message.split(' ')[0]]

describe('evaluating a row', () => {
  it("is done with the row's value, read out of its wrappers", async () => {
    const expression = {
      vars: { rate: 2 },
      operator: 'map',
      input: '$data.list',
      each: { $multiply: ['$element', '$vars.rate'] },
    }
    const evaluation = await evaluate(expression, ['each'], { data: { list: [1, 2] } })
    expect(evaluation).toMatchObject({
      path: ['each'],
      status: 'done',
      result: [2, 4],
      fallbacks: [],
    })
    expect(evaluation).not.toHaveProperty('failure')
    expect(evaluation.trace).toBeDefined()
    expect(evaluation.toTreePath(['value', 'input'])).toEqual(['input'])
  })

  it('fails with the error thrown, in the tree, and its trace', async () => {
    const evaluation = await evaluate({ x: { a: FAILING, b: 2 } }, ['x'])
    expect(evaluation.status).toBe('failed')
    expect(evaluation).not.toHaveProperty('result')
    expect(failed(evaluation)).toEqual([['x', 'a'], 'divide'])
    expect(evaluation.trace).toBeDefined()
  })

  it('fails where an iterator around the row failed for one element', async () => {
    const expression = { operator: 'map', input: [1, 0], each: { $divide: [1, '$element'] } }
    const evaluation = await evaluate(expression, ['each'])
    expect(evaluation.status).toBe('failed')
    expect(failed(evaluation)).toEqual([['each'], 'divide'])
  })

  it('fails where the evaluation times out', async () => {
    const slow = new FigTree({ operators: [coreOperators, [wait]], timeout: 50 })
    const expression = { x: { operator: 'wait' } }
    const subTree = buildSubTree(expression, ['x'], {
      classification: classify(expression, registry),
      operators: registry.operators,
    })!
    const evaluation = await evaluateSubTree(slow, ['x'], subTree, {})
    expect(evaluation.status).toBe('failed')
    expect(failed(evaluation)).toEqual([['x'], 'evaluation'])
  })

  it('fails, with no trace, where fig-tree refuses it', async () => {
    const evaluation = await evaluate({ operator: 'plsu' }, [])
    expect(evaluation.status).toBe('failed')
    expect(evaluation).not.toHaveProperty('trace')
    expect(failed(evaluation)).toEqual([[], "'plsu'"])
  })

  it('is cancelled where its signal aborts, and never rejects', async () => {
    const abort = new AbortController()
    const pending = evaluate({ $plus: [{ operator: 'wait' }, '!'] }, [], { signal: abort.signal })
    abort.abort()
    const evaluation = await pending
    expect(evaluation).toMatchObject({ status: 'cancelled', fallbacks: [] })
    expect(evaluation).not.toHaveProperty('failure')
  })

  describe('fallbacks', () => {
    it("lists those that fired, the row's own included, with what each caught", async () => {
      const expression = {
        operator: 'plus',
        values: [1, { ...FAILING, fallback: 10 }],
        fallback: 0,
      }
      const own = await evaluate({ ...FAILING, fallback: 'own' }, [])
      expect(own).toMatchObject({ status: 'done', result: 'own' })
      expect(own.fallbacks.map(({ path, error }) => [path, error.code])).toEqual([
        [[], 'non-finite-result'],
      ])
      const nested = await evaluate(expression, [])
      expect(nested).toMatchObject({ status: 'done', result: 11 })
      expect(nested.fallbacks.map(({ path }) => path)).toEqual([['values', 1]])
    })

    it("leaves out one in a fragment body, whose path is the body's", async () => {
      const evaluation = await evaluate({ fragment: 'risky' }, [])
      expect(evaluation).toMatchObject({ status: 'done', result: 'caught in the body' })
      expect(evaluation.fallbacks).toEqual([])
    })
  })

  it("keeps a failure's fragment, and where in its body it failed", async () => {
    const evaluation = await evaluate({ x: { fragment: 'broken' } }, ['x'])
    expect(evaluation.status).toBe('failed')
    expect(evaluation.failure).toMatchObject({ path: ['x'], fragment: 'broken' })
    expect(evaluation.failure?.fragmentPath).toBeDefined()
  })
})

describe('the evaluator', () => {
  // Rows that settle when the test says, with every handler call recorded
  const setup = () => {
    const calls: string[] = []
    const settle = new Map<string, (evaluation: Evaluation) => void>()
    const signals = new Map<string, AbortSignal>()
    const evaluation = (path: Path, status: Evaluation['status']) =>
      ({
        path,
        status,
        fallbacks: [],
        toTreePath: (p) => p,
      }) as Evaluation
    const handlers: EvaluatorHandlers = {
      prepare: (path) =>
        path[0] === 'none'
          ? null
          : ({
              start: (signal) => {
                signals.set(String(path[0]), signal)
                return new Promise((resolve) => settle.set(String(path[0]), resolve))
              },
              cancelled: () => evaluation(path, 'cancelled'),
            } satisfies PreparedEvaluation),
      onStart: (path) => calls.push(`start ${String(path[0])}`),
      onEvaluate: ({ path, status }) => calls.push(`${status} ${String(path[0])}`),
    }
    const evaluator = createEvaluator(() => handlers)
    const finish = async (name: string) => {
      await started()
      settle.get(name)!(evaluation([name], 'done'))
      await Promise.resolve()
    }
    return { evaluator, calls, finish, signals }
  }
  // The evaluator starts each evaluation on the next task
  const started = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('reports the start, then the evaluation, and says which row is running', async () => {
    const { evaluator, calls, finish } = setup()
    const listener = vi.fn()
    evaluator.subscribe(listener)
    evaluator.evaluate(['a'])
    expect(evaluator.isRunning(['a'])).toBe(true)
    expect(evaluator.isRunning(['b'])).toBe(false)
    await finish('a')
    expect(calls).toEqual(['start a', 'done a'])
    expect(evaluator.isRunning(['a'])).toBe(false)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('cancels the one running when it is started again, at once, ignoring its result', async () => {
    const { evaluator, calls, finish, signals } = setup()
    evaluator.evaluate(['a'])
    await started()
    evaluator.evaluate(['a'])
    expect(calls).toEqual(['start a', 'cancelled a'])
    expect(signals.get('a')!.aborted).toBe(true)
    await finish('a')
    expect(calls).toEqual(['start a', 'cancelled a'])
  })

  it('cancels the one running when another starts, reporting it first', async () => {
    const { evaluator, calls, finish } = setup()
    evaluator.evaluate(['a'])
    await started()
    evaluator.evaluate(['b'])
    await finish('a')
    await finish('b')
    expect(calls).toEqual(['start a', 'cancelled a', 'start b', 'done b'])
  })

  it('never starts one cancelled before its turn came', async () => {
    const { evaluator, calls, signals } = setup()
    evaluator.evaluate(['a'])
    evaluator.evaluate(['b'])
    await started()
    expect(calls).toEqual(['start a', 'cancelled a', 'start b'])
    expect([...signals.keys()]).toEqual(['b'])
  })

  it("reports nothing for a row that can't be evaluated, cancelling the one running", () => {
    const { evaluator, calls } = setup()
    evaluator.evaluate(['a'])
    evaluator.evaluate(['none'])
    expect(calls).toEqual(['start a', 'cancelled a'])
  })

  it('cancels on demand, and does nothing with none running', () => {
    const { evaluator, calls } = setup()
    evaluator.cancel()
    evaluator.evaluate(['a'])
    evaluator.cancel()
    expect(calls).toEqual(['start a', 'cancelled a'])
  })
})
