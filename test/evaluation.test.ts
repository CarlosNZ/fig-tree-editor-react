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
  return evaluateSubTree(figTree, path, subTree, { mode: 'report', ...options })
}

// A failure as [its path in the tree, its hole's, its message's start]
const failures = ({ failures: list }: Evaluation) =>
  list.map(({ path, holePath, message }) => [path, holePath, message.split(' ')[0]])

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
      mode: 'report',
      status: 'done',
      result: [2, 4],
      failures: [],
      fallbacks: [],
    })
    expect(evaluation.trace).toBeDefined()
    expect(evaluation.toTreePath(['value', 'input'])).toEqual(['input'])
  })

  describe('in report mode', () => {
    it('is done with a partial result, listing what failed, in the tree', async () => {
      const expression = { x: { a: FAILING, b: 2 } }
      const evaluation = await evaluate(expression, ['x'])
      expect(evaluation).toMatchObject({ status: 'done', result: { a: null, b: 2 } })
      expect(failures(evaluation)).toEqual([[['x', 'a'], ['x', 'a'], 'divide']])
    })

    it('fails where the row itself failed', async () => {
      const evaluation = await evaluate({ x: { $plus: [1, FAILING] } }, ['x', '$plus', 1])
      expect(evaluation.status).toBe('failed')
      expect(evaluation).not.toHaveProperty('result')
      expect(failures(evaluation)).toEqual([[['x', '$plus', 1], ['x', '$plus', 1], 'divide']])
    })

    it('fails where what holds the row failed, as an iterator does for one element', async () => {
      const expression = { operator: 'map', input: [1, 0], each: { $divide: [1, '$element'] } }
      const evaluation = await evaluate(expression, ['each'])
      expect(evaluation.status).toBe('failed')
      expect(failures(evaluation)).toEqual([[['each'], [], 'divide']])
    })

    it('fails where a failure has no hole, failing the whole evaluation, as a timeout does', async () => {
      const slow = new FigTree({ operators: [coreOperators, [wait]], timeout: 50 })
      const expression = { x: { operator: 'wait' } }
      const subTree = buildSubTree(expression, ['x'], {
        classification: classify(expression, registry),
        operators: registry.operators,
      })!
      const evaluation = await evaluateSubTree(slow, ['x'], subTree, { mode: 'report' })
      expect(evaluation.status).toBe('failed')
      expect(failures(evaluation)).toEqual([[['x'], undefined, 'evaluation']])
    })

    it('fails, with no trace, where fig-tree refuses it', async () => {
      const evaluation = await evaluate({ operator: 'plsu' }, [])
      expect(evaluation.status).toBe('failed')
      expect(evaluation).not.toHaveProperty('trace')
      expect(failures(evaluation)).toEqual([[[], undefined, "'plsu'"]])
    })
  })

  describe('in throw mode', () => {
    it('is done as in report mode', async () => {
      expect(await evaluate({ $plus: [1, 2] }, [], { mode: 'throw' })).toMatchObject({
        mode: 'throw',
        status: 'done',
        result: 3,
      })
    })

    it('fails with the one error thrown, and its trace', async () => {
      const evaluation = await evaluate({ x: { a: FAILING, b: 2 } }, ['x'], { mode: 'throw' })
      expect(evaluation.status).toBe('failed')
      // Nothing degrades in throw mode, so there is no hole
      expect(failures(evaluation)).toEqual([[['x', 'a'], undefined, 'divide']])
      expect(evaluation.trace).toBeDefined()
    })
  })

  it('is cancelled where its signal aborts, and never rejects', async () => {
    const abort = new AbortController()
    const pending = evaluate({ $plus: [{ operator: 'wait' }, '!'] }, [], { signal: abort.signal })
    abort.abort()
    expect(await pending).toMatchObject({ status: 'cancelled', failures: [], fallbacks: [] })
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
    expect(evaluation.failures[0]).toMatchObject({ path: ['x'], fragment: 'broken' })
    expect(evaluation.failures[0].fragmentPath).toBeDefined()
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
        mode: 'report',
        failures: [],
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
      settle.get(name)!(evaluation([name], 'done'))
      await Promise.resolve()
    }
    return { evaluator, calls, finish, signals }
  }

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
    evaluator.evaluate(['a'])
    expect(calls).toEqual(['start a', 'cancelled a'])
    expect(signals.get('a')!.aborted).toBe(true)
    await finish('a')
    expect(calls).toEqual(['start a', 'cancelled a'])
  })

  it('cancels the one running when another starts, reporting it first', async () => {
    const { evaluator, calls, finish } = setup()
    evaluator.evaluate(['a'])
    evaluator.evaluate(['b'])
    await finish('a')
    await finish('b')
    expect(calls).toEqual(['start a', 'cancelled a', 'start b', 'done b'])
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
