import { describe, expect, it } from 'vitest'
import { FigTree, coreOperators, defineOperator } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { classify } from '../src/classify'
import { evaluateSubTree, type Evaluation } from '../src/evaluation'
import { displayPath, type Path } from '../src/paths'
import { markRun, type RunMarks } from '../src/runMarks'
import { buildSubTree } from '../src/subTree'

// A host operator giving `give` after `ms`, unless it is aborted first
const wait = defineOperator({
  name: 'wait',
  category: 'other',
  description: 'Waits',
  parameters: { ms: { type: 'number', required: true }, give: { type: 'any', required: false } },
  evaluate: ({ ms, give }, { signal }) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(give), ms)
      signal.addEventListener('abort', () => {
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
  cache: true,
  evaluate: (_, { cache }) => cache.memo('once', () => Promise.resolve(42)),
})

const figTree = new FigTree({
  operators: [coreOperators, [wait, once]],
  fragments: { broken: { expression: { $divide: [1, 0] } } },
})

const FAILING = { $divide: [1, 0] } // a non-finite result, at run time

const evaluate = async (
  expression: unknown,
  path: Path,
  {
    instance = figTree,
    ...options
  }: Partial<Parameters<typeof evaluateSubTree>[3]> & { instance?: FigTree } = {}
) => {
  const registry = { operators: instance.getOperators(), fragments: instance.getFragments() }
  const classification = classify(expression, registry)
  const subTree = buildSubTree(expression, path, {
    classification,
    operators: registry.operators,
  })!
  const evaluation = await evaluateSubTree(instance, path, subTree, { mode: 'report', ...options })
  return { evaluation, marks: markRun(evaluation, classification, subTree.row)! }
}

// Each marked row's status, by its path in display form: the nodes and
// references, with the evaluated row whatever it is, or the plain data
const statuses = (marks: RunMarks, plain = false) =>
  Object.fromEntries(
    [...marks.values()]
      .filter(({ path, part }) =>
        plain
          ? part === 'constant' || part === 'container'
          : part === 'node' || part === 'reference' || path.length === 0
      )
      .map(({ path, status }) => [displayPath(path) || '(root)', status])
  )

const at = (marks: RunMarks, path: Path) => marks.get(toPathString(path))!

describe('marking how a run went', () => {
  it('marks each node and reference in the row by how it ran, with its value and time', async () => {
    const { marks } = await evaluate(
      { x: { $plus: [{ $multiply: [2, 3] }, '$data.a'] }, y: { $plus: [1, 1] } },
      ['x'],
      { data: { a: 1 } }
    )
    expect(statuses(marks)).toEqual({ x: 'value', 'x.$plus[0]': 'value', 'x.$plus[1]': 'value' })
    const { runs } = at(marks, ['x'])
    expect(runs).toMatchObject([{ status: 'value', value: 7, cached: false }])
    expect(runs[0].elapsed).toBeTypeOf('number')
    expect(at(marks, ['x', '$plus', 1]).runs[0].value).toBe(1)
  })

  it('marks the evaluated row whatever it is, a plain root included', async () => {
    const { marks } = await evaluate({ a: { $plus: [1, 2] }, b: 3 }, [])
    expect(statuses(marks)).toEqual({ '(root)': 'value', a: 'value' })
    expect(at(marks, []).runs[0].value).toEqual({ a: 3, b: 3 })
  })

  it('marks a var evaluated on its own by its run, not the unread copy its scope holds', async () => {
    const { marks } = await evaluate(
      {
        a: '$vars.total',
        vars: { rate: { $plus: [1, 1] }, total: { $multiply: ['$vars.rate', 3] } },
      },
      ['vars', 'total']
    )
    expect(statuses(marks)).toEqual({
      'vars.total': 'value',
      'vars.total.$multiply[0]': 'value',
      'vars.rate': 'value',
    })
    expect(at(marks, ['vars', 'total']).runs).toMatchObject([{ status: 'value', value: 6 }])

    const { marks: nested } = await evaluate(
      { a: 1, vars: { inner: { b: { $plus: ['$vars.n', 1] }, vars: { n: { $plus: [2, 2] } } } } },
      ['vars', 'inner', 'vars', 'n']
    )
    expect(at(nested, ['vars', 'inner', 'vars', 'n']).runs).toMatchObject([
      { status: 'value', value: 4 },
    ])
  })

  describe('rows that never ran', () => {
    it('marks a branch passed over, and what is inside it, saying why', async () => {
      const { marks } = await evaluate(
        {
          operator: 'if',
          condition: true,
          then: { $plus: [1, 1] },
          else: { $subtract: [{ $plus: [1, 1] }, 1] },
        },
        []
      )
      expect(statuses(marks)).toEqual({
        '(root)': 'value',
        then: 'value',
        else: 'skipped',
        'else.$subtract[0]': 'skipped',
      })
      expect(at(marks, ['else'])).toMatchObject({ runs: [{ status: 'skipped' }] })
      expect(at(marks, ['else']).reason).toEqual({ kind: 'whenNeeded' })
      expect(at(marks, ['else', '$subtract', 0])).toMatchObject({
        runs: [],
        reason: { kind: 'inside', path: ['else'], status: 'skipped' },
      })
    })

    it('gives a fallback not needed, and a var nothing read, their own reasons', async () => {
      const { marks } = await evaluate(
        {
          $plus: ['$vars.used', 1],
          fallback: { $plus: [0, 0] },
          vars: { used: { $plus: [1, 1] }, unused: { $plus: [2, 2] } },
        },
        []
      )
      expect(statuses(marks)).toEqual({
        '(root)': 'value',
        '$plus[0]': 'value',
        fallback: 'skipped',
        'vars.used': 'value',
        'vars.unused': 'skipped',
      })
      expect(at(marks, ['fallback']).reason).toEqual({ kind: 'fallbackUnused' })
      expect(at(marks, ['vars', 'unused']).reason).toEqual({ kind: 'unread' })
    })

    it("marks a row the run stopped short of as never reached, where nothing holding it didn't run", () => {
      // A trace that stops at its root, as a failure can leave it
      const expression = { $plus: [{ $plus: [1, 1] }, 1] }
      const evaluation: Evaluation = {
        path: [],
        mode: 'throw',
        status: 'failed',
        failures: [],
        fallbacks: [],
        trace: { path: [], kind: 'operator', operator: 'plus', status: 'failed' },
        toTreePath: (path) => path,
      }
      const marks = markRun(
        evaluation,
        classify(expression, { operators: figTree.getOperators(), fragments: [] }),
        []
      )!
      expect(at(marks, ['$plus', 0])).toMatchObject({
        status: 'skipped',
        runs: [],
        reason: { kind: 'notReached' },
      })
    })

    it('marks what throw mode passed over at its first failure', async () => {
      const { marks } = await evaluate(
        { operator: 'if', condition: FAILING, then: { $plus: [{ $plus: [1, 1] }, 1] }, else: 0 },
        [],
        { mode: 'throw' }
      )
      expect(statuses(marks)).toEqual({
        '(root)': 'failed',
        condition: 'failed',
        then: 'skipped',
        'then.$plus[0]': 'skipped',
      })
      expect(at(marks, ['then', '$plus', 0]).reason).toEqual({
        kind: 'inside',
        path: ['then'],
        status: 'skipped',
      })
    })
  })

  describe('plain data', () => {
    it('marks a constant branch by whether the run took it, saying why where it passed one over', async () => {
      const { marks } = await evaluate(
        { operator: 'if', condition: true, then: 'yes', else: { why: 'no' } },
        []
      )
      expect(statuses(marks, true)).toEqual({ condition: 'value', then: 'value', else: 'skipped' })
      expect(at(marks, ['then']).part).toBe('constant')
      expect(at(marks, ['else']).reason).toEqual({ kind: 'whenNeeded' })
    })

    it('marks a constant as one piece, leaving the rows inside it unmarked', async () => {
      const { marks } = await evaluate(
        { operator: 'match', value: 'a', branches: { a: { x: 1 }, b: [1, 2] } },
        []
      )
      expect(statuses(marks, true)).toEqual({ value: 'value', branches: 'value' })

      // A shorthand's argument list of constants, which has no slot of its own
      const { marks: listed } = await evaluate({ $firstOf: [null, 'first', 'second'] }, [])
      expect(statuses(listed, true)).toEqual({})
    })

    it('marks a container, and each constant in it as reached wherever the container ran', async () => {
      const { marks } = await evaluate(
        {
          operator: 'if',
          condition: false,
          then: [1, { $upper: 'x' }],
          else: { a: 1, b: '$data.x' },
        },
        [],
        { data: { x: 'y' } }
      )
      expect(statuses(marks, true)).toEqual({
        condition: 'value',
        then: 'skipped',
        'then[0]': 'skipped',
        'then[1].$upper': 'skipped',
        else: 'value',
        'else.a': 'value',
      })
      expect(at(marks, ['else']).part).toBe('container')
      expect(at(marks, ['else', 'a'])).toMatchObject({ part: 'constant', runs: [] })
      expect(at(marks, ['then', 0]).reason).toEqual({
        kind: 'inside',
        path: ['then'],
        status: 'skipped',
      })
    })

    it('marks a fallback not needed and a var nothing read, but not what configures a node', async () => {
      const { marks } = await evaluate(
        {
          operator: 'plus',
          values: ['$vars.used', 1],
          fallback: 0,
          vars: { used: 2, unused: 3 },
        },
        []
      )
      expect(statuses(marks, true)).toEqual({
        values: 'value',
        'values[1]': 'value',
        fallback: 'skipped',
        'vars.used': 'value',
        'vars.unused': 'skipped',
      })
      expect(at(marks, ['fallback']).reason).toEqual({ kind: 'fallbackUnused' })
      expect(at(marks, ['vars', 'unused']).reason).toEqual({ kind: 'unread' })

      // An `as` name
      const { marks: mapped } = await evaluate({ $map: { input: [1, 2], as: 'n', each: '$n' } }, [])
      expect(statuses(mapped, true)).toEqual({ '$map.input': 'value' })
    })
  })

  describe('fallbacks', () => {
    it('marks the node its fallback caught, with what it caught, and the fallback by its own run', async () => {
      const { marks } = await evaluate({ ...FAILING, fallback: { $plus: [0, 0] } }, [])
      expect(statuses(marks)).toEqual({ '(root)': 'fallback', fallback: 'value' })
      const [run] = at(marks, []).runs
      expect(run).toMatchObject({ status: 'fallback', value: 0 })
      expect(run.error?.message).toMatch(/non-finite/)
    })

    it('marks both failed where the fallback fails too', async () => {
      const { marks } = await evaluate({ ...FAILING, fallback: { $divide: [2, 0] } }, [])
      expect(statuses(marks)).toEqual({ '(root)': 'failed', fallback: 'failed' })
    })
  })

  describe('iterators', () => {
    it('marks a node inside one by the worst of its runs, one per element', async () => {
      const { marks } = await evaluate(
        { operator: 'map', input: [1, 0], each: { $divide: [1, '$element'] } },
        []
      )
      expect(statuses(marks)).toEqual({
        '(root)': 'failed',
        each: 'failed',
        'each.$divide[1]': 'value',
      })
      expect(at(marks, ['each']).runs.map(({ status }) => status)).toEqual(['value', 'failed'])
      expect(at(marks, ['each']).perElement).toBe(true)
      expect(at(marks, []).perElement).toBe(false)
      expect(at(marks, ['each', '$divide', 1]).runs.map(({ value }) => value)).toEqual([1, 0])
    })

    it('marks a row that ran for some elements and not others as ran', async () => {
      const { marks } = await evaluate(
        {
          operator: 'map',
          input: [1, 2],
          each: {
            operator: 'if',
            condition: { $greaterThan: ['$element', 1] },
            then: { $plus: ['$element', 10] },
            else: 0,
          },
        },
        []
      )
      const then = at(marks, ['each', 'then'])
      expect(then.status).toBe('value')
      expect(then.runs.map(({ status }) => status)).toEqual(['skipped', 'value'])
      expect(then.reason).toBeUndefined()
    })

    it('takes in the scope wrapped around a row inside one, but not the iterator itself', async () => {
      const { marks } = await evaluate(
        {
          vars: { rate: { $plus: [1, 1] }, unused: { $plus: [2, 2] } },
          operator: 'map',
          input: '$data.xs',
          each: { $multiply: ['$element', '$vars.rate'] },
        },
        ['each'],
        { data: { xs: [1, 2] } }
      )
      expect(statuses(marks)).toEqual({
        each: 'value',
        'each.$multiply[0]': 'value',
        'each.$multiply[1]': 'value',
        input: 'value',
        'vars.rate': 'value',
        'vars.unused': 'skipped',
      })
      expect(at(marks, ['each']).runs.map(({ value }) => value)).toEqual([2, 4])
      expect(at(marks, ['vars', 'unused']).reason).toEqual({ kind: 'unread' })
    })
  })

  describe('cancelled nodes', () => {
    it("marks a race's loser cancelled, once the answer is known", async () => {
      const { marks } = await evaluate(
        { $or: [{ $wait: { ms: 10, give: true } }, { $wait: { ms: 200, give: false } }] },
        []
      )
      expect(statuses(marks)).toEqual({
        '(root)': 'value',
        '$or[0]': 'value',
        '$or[1]': 'cancelled',
      })
      expect(at(marks, ['$or', 1]).reason).toEqual({ kind: 'race' })
    })

    it('marks a node the timeout stopped', async () => {
      const instance = new FigTree({ operators: [coreOperators, [wait]], timeout: 50 })
      const { evaluation, marks } = await evaluate({ $wait: { ms: 300, give: 1 } }, [], {
        instance,
      })
      expect(evaluation.status).toBe('failed')
      expect(at(marks, [])).toMatchObject({ status: 'cancelled', reason: { kind: 'timeout' } })
    })
  })

  describe('nulls a failure left', () => {
    it('go to the evaluated row, where it is plain data holding the failed node', async () => {
      const { marks } = await evaluate({ title: { $upper: 'ada' }, total: FAILING }, [])
      expect(statuses(marks)).toEqual({ '(root)': 'value', title: 'value', total: 'failed' })
      expect(at(marks, []).runs[0].value).toEqual({ title: 'ADA', total: null })
      expect(at(marks, []).nulls).toMatchObject([{ path: ['total'], holePath: ['total'] }])
      expect(at(marks, ['total']).nulls).toEqual([])
    })

    it('leave none in a node, which a failure beneath fails, whatever its null policy', async () => {
      const { marks } = await evaluate(
        { a: { operator: 'if', condition: FAILING, then: 1, else: 2 } },
        []
      )
      expect(statuses(marks)).toEqual({ '(root)': 'value', a: 'failed', 'a.condition': 'failed' })
      expect(at(marks, []).nulls).toMatchObject([{ holePath: ['a'] }])
    })
  })

  it('gives where a failure came from, in the tree', async () => {
    const { marks } = await evaluate(
      { vars: { n: 0 }, a: { operator: 'if', condition: { $divide: [1, '$vars.n'] }, then: 1 } },
      ['a']
    )
    expect(statuses(marks)).toEqual({
      a: 'failed',
      'a.condition': 'failed',
      'a.condition.$divide[1]': 'value',
    })
    expect(at(marks, ['a']).runs[0].failedAt).toEqual(['a', 'condition'])
    expect(at(marks, ['a', 'condition']).runs[0].failedAt).toEqual(['a', 'condition'])
  })

  it('marks a fragment call by its own run, leaving out its body', async () => {
    const { marks } = await evaluate({ x: { fragment: 'broken' } }, ['x'])
    expect(statuses(marks)).toEqual({ x: 'failed' })
    expect(at(marks, ['x']).runs[0].error).toMatchObject({ fragment: 'broken' })
  })

  it('marks a value from the cache', async () => {
    const instance = new FigTree({ operators: [coreOperators, [once]] })
    const expression = { operator: 'once' }
    const first = await evaluate(expression, [], { instance })
    expect(at(first.marks, []).runs[0].cached).toBe(false)
    const second = await evaluate(expression, [], { instance })
    expect(at(second.marks, []).runs[0]).toMatchObject({ status: 'value', value: 42, cached: true })
  })

  it("marks a fragment call's result cached where every lookup its body made hit", async () => {
    const echo = defineOperator({
      name: 'echo',
      category: 'other',
      description: 'Gives its value, cached by it',
      parameters: { value: { type: 'any' } },
      cache: true,
      evaluate: ({ value }, { cache }) =>
        cache.memo(`echo ${String(value)}`, () => Promise.resolve(value)),
    })
    const instance = new FigTree({
      operators: [coreOperators, [once, echo]],
      fragments: {
        cachedOnce: { expression: { operator: 'once' } },
        // One lookup hits on a second run, and one, for a new `n`, misses
        mixed: {
          expression: { $plus: [{ operator: 'once' }, { operator: 'echo', value: '$params.n' }] },
          parameters: { n: { type: 'number' } },
        },
      },
    })
    const expression = (n: number) => ({
      a: { fragment: 'cachedOnce' },
      b: { fragment: 'mixed', parameters: { n } },
      c: { operator: 'once' },
      d: { $plus: [{ operator: 'once' }, 1] },
    })
    const first = await evaluate(expression(1), [], { instance })
    expect(at(first.marks, ['a']).runs[0].cached).toBe(false)
    const { marks } = await evaluate(expression(2), [], { instance })
    expect(at(marks, ['a']).runs[0].cached).toBe(true)
    expect(at(marks, ['b']).runs[0].cached).toBe(false)
    expect(at(marks, ['c']).runs[0].cached).toBe(true)
    // A node in the tree is cached by its own lookup only, not its children's
    expect(at(marks, ['d']).runs[0].cached).toBe(false)
    expect(at(marks, ['d', '$plus', 0]).runs[0].cached).toBe(true)
  })

  it('marks only the evaluated row, failed, where there is no trace', async () => {
    const { evaluation, marks } = await evaluate(
      { x: { operator: 'nope' }, y: { $plus: [1, 1] } },
      ['x']
    )
    expect(evaluation.trace).toBeUndefined()
    expect(statuses(marks)).toEqual({ x: 'failed' })
    expect(at(marks, ['x']).runs[0].error?.code).toBe('unknown-operator')
  })

  it('leaves nothing for a cancelled evaluation', async () => {
    const expression = { $wait: { ms: 200 } }
    const classification = classify(expression, {
      operators: figTree.getOperators(),
      fragments: [],
    })
    const subTree = buildSubTree(expression, [], {
      classification,
      operators: figTree.getOperators(),
    })!
    const abort = new AbortController()
    const pending = evaluateSubTree(figTree, [], subTree, { mode: 'report', signal: abort.signal })
    abort.abort()
    expect(markRun(await pending, classification, subTree.row)).toBeNull()
  })
})
