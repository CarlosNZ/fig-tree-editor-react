import { describe, expect, it } from 'vitest'
import { FigTree, coreOperators, type FigTreeError } from 'fig-tree-evaluator'
import { classify } from '../src/classify'
import { type Path } from '../src/paths'
import { blockingErrors, buildSubTree } from '../src/subTree'
import { figTree, registry } from './fixtures'

const contextFor = (expression: unknown, operators = registry.operators) => ({
  classification: classify(expression, { ...registry, operators }),
  operators,
})

const build = (expression: unknown, path: Path) =>
  buildSubTree(expression, path, contextFor(expression))

// A row evaluated as 10.6 will: its sub-tree, then its value read out of the
// wrappers, or the path of the failure it threw mapped to the tree
const evaluateRow = async (expression: unknown, path: Path, data?: Record<string, unknown>) => {
  const subTree = build(expression, path)!
  try {
    return { value: subTree.readResult(await figTree.evaluate(subTree.expression, { data })) }
  } catch (error) {
    return { failure: subTree.toTreePath((error as FigTreeError).path) }
  }
}

const FAILING = { $divide: [1, 0] } // a non-finite result, at run time

describe('a sub-tree', () => {
  describe('with no scope around it', () => {
    it('is the row itself, the root included', () => {
      const expression = { a: { $plus: [1, 2] } }
      expect(build(expression, ['a'])!.expression).toBe(expression.a)
      expect(build(expression, [])!.expression).toBe(expression)
    })

    it("maps paths onto the row's own", () => {
      expect(build({ a: { $plus: [1, 2] } }, ['a'])!.toTreePath(['$plus', 1])).toEqual([
        'a',
        '$plus',
        1,
      ])
    })
  })

  describe("the design's example", () => {
    const expression = {
      vars: { rate: 0.15 },
      operator: 'map',
      input: '$data.orders',
      as: 'order',
      each: {
        vars: { shipping: 5 },
        operator: 'plus',
        values: [
          '$order.total',
          { operator: 'multiply', values: ['$order.total', '$vars.rate'] },
          '$vars.shipping',
        ],
      },
    }
    const data = { orders: [{ total: 100 }, { total: 20 }] }
    const multiply = ['each', 'values', 1]

    it('wraps the row in each block and iterator around it, outermost first', () => {
      expect(build(expression, multiply)!.expression).toEqual({
        vars: { rate: 0.15 },
        value: {
          operator: 'map',
          input: '$data.orders',
          as: 'order',
          each: {
            vars: { shipping: 5 },
            value: { operator: 'multiply', values: ['$order.total', '$vars.rate'] },
          },
        },
      })
    })

    it("gives the row's value for each element, and the whole tree its own", async () => {
      expect((await evaluateRow(expression, multiply, data)).value).toEqual([15, 3])
      // A row that doesn't read the binding still runs once per element
      expect((await evaluateRow(expression, ['each', 'values', 2], data)).value).toEqual([5, 5])
      expect((await evaluateRow(expression, [], data)).value).toEqual([120, 28])
    })

    it('maps each piece back to the row it stands for', () => {
      const { toTreePath } = build(expression, multiply)!
      expect(toTreePath([])).toEqual([])
      expect(toTreePath(['vars', 'rate'])).toEqual(['vars', 'rate'])
      expect(toTreePath(['value'])).toEqual([])
      expect(toTreePath(['value', 'input'])).toEqual(['input'])
      expect(toTreePath(['value', 'as'])).toEqual(['as'])
      expect(toTreePath(['value', 'each'])).toEqual(['each'])
      expect(toTreePath(['value', 'each', 'vars', 'shipping'])).toEqual([
        'each',
        'vars',
        'shipping',
      ])
      expect(toTreePath(['value', 'each', 'value', 'values', 1])).toEqual([
        'each',
        'values',
        1,
        'values',
        1,
      ])
    })
  })

  describe('in vars blocks', () => {
    it("reads a node's block", async () => {
      const expression = {
        operator: 'plus',
        vars: { x: 2 },
        values: ['$vars.x', { $multiply: ['$vars.x', 3] }],
      }
      expect((await evaluateRow(expression, ['values', 1])).value).toBe(6)
    })

    it("reads a plain object's block", async () => {
      const expression = {
        vars: { name: 'Ada' },
        greeting: { $buildString: ['Hi %1', '$vars.name'] },
      }
      expect((await evaluateRow(expression, ['greeting'])).value).toBe('Hi Ada')
    })

    it('nests blocks, so an inner var shadows an outer one, and reads the outer', async () => {
      const expression = {
        vars: { x: 1, y: 10 },
        inner: { vars: { x: 2 }, operator: 'plus', values: ['$vars.x', '$vars.y'] },
      }
      expect((await evaluateRow(expression, ['inner', 'values', 0])).value).toBe(2)
      expect((await evaluateRow(expression, ['inner'])).value).toBe(12)
    })

    it('evaluates a var in its own block, reading a sibling', async () => {
      const expression = { vars: { a: 2, b: { $plus: ['$vars.a', 1] } }, value: '$vars.b' }
      expect((await evaluateRow(expression, ['vars', 'b'])).value).toBe(3)
    })
  })

  describe('in iterators', () => {
    it('gives one value per element, with `$element` and `$index`', async () => {
      const expression = {
        operator: 'map',
        input: [10, 20],
        each: { $plus: ['$element', '$index'] },
      }
      expect((await evaluateRow(expression, ['each'])).value).toEqual([10, 21])
    })

    it('binds the `as` name', async () => {
      const expression = {
        operator: 'map',
        input: [1, 2],
        as: 'n',
        each: { $multiply: ['$n', 10] },
      }
      expect((await evaluateRow(expression, ['each'])).value).toEqual([10, 20])
    })

    it("gives a filter's predicate value for each element", async () => {
      const expression = {
        operator: 'filter',
        input: [1, 5, 10],
        each: { $greaterThan: ['$element', 4] },
      }
      expect((await evaluateRow(expression, ['each'])).value).toEqual([false, true, true])
    })

    it('nests, giving nested arrays', async () => {
      const expression = {
        operator: 'map',
        input: [[1, 2], [3]],
        as: 'row',
        each: { operator: 'map', input: '$row', each: { $multiply: ['$element', 10] } },
      }
      expect((await evaluateRow(expression, ['each', 'each'])).value).toEqual([[10, 20], [30]])
    })

    it("goes over an input that reads the iterator's own vars", async () => {
      const expression = {
        vars: { list: [1, 2] },
        operator: 'map',
        input: '$vars.list',
        each: { $plus: ['$element', 1] },
      }
      expect((await evaluateRow(expression, ['each'])).value).toEqual([2, 3])
    })

    it('finds the input of a shorthand iterator, named or positional', async () => {
      const each = { $plus: ['$element', 1] }
      const named = { $map: { input: [1, 2], each } }
      expect((await evaluateRow(named, ['$map', 'each'])).value).toEqual([2, 3])
      const positional = { $map: [[1, 2], each] }
      expect((await evaluateRow(positional, ['$map', 1])).value).toEqual([2, 3])
      expect(build(positional, ['$map', 1])!.toTreePath(['input'])).toEqual(['$map', 0])
    })

    it("doesn't wrap the input, which is outside the binding", () => {
      const expression = { operator: 'map', input: { $plus: [[1], [2]] }, each: '$element' }
      expect(build(expression, ['input'])!.expression).toBe(expression.input)
    })
  })

  describe('fallbacks', () => {
    it("applies the row's own", async () => {
      expect((await evaluateRow({ ...FAILING, fallback: 'own' }, [])).value).toBe('own')
    })

    it("doesn't apply an ancestor's, so the row's failure shows", async () => {
      const expression = { operator: 'plus', values: [1, FAILING], fallback: 0 }
      expect(await evaluateRow(expression, ['values', 1])).toEqual({ failure: ['values', 1] })
      expect((await evaluateRow(expression, [])).value).toBe(0)
    })

    it("evaluates a fallback row in its node's scope", async () => {
      const expression = { vars: { x: 5 }, ...FAILING, fallback: '$vars.x' }
      expect((await evaluateRow(expression, ['fallback'])).value).toBe(5)
    })
  })

  describe('failures', () => {
    it('map to the rows that failed: in the row, a wrapped var, a wrapped input', async () => {
      const inRow = { vars: { x: 0 }, value: { $plus: [1, { $divide: [1, '$vars.x'] }] } }
      expect(await evaluateRow(inRow, ['value'])).toEqual({ failure: ['value', '$plus', 1] })
      const inVar = { vars: { bad: FAILING }, value: { $plus: ['$vars.bad', 1] } }
      expect(await evaluateRow(inVar, ['value'])).toEqual({ failure: ['vars', 'bad'] })
      const inInput = { operator: 'map', input: FAILING, each: '$element' }
      expect(await evaluateRow(inInput, ['each'])).toEqual({ failure: ['input'] })
    })

    it('map to the row where one element of an iterator around it fails', async () => {
      const perElement = { operator: 'map', input: [1, 0], each: { $divide: [1, '$element'] } }
      expect(await evaluateRow(perElement, ['each'])).toEqual({ failure: ['each'] })
    })

    it("read a wrapper's value that isn't what it builds as null", () => {
      const expression = { operator: 'map', input: [1, 2], each: '$element' }
      expect(build(expression, ['each'])!.readResult('n/a')).toBeNull()
      const scoped = { vars: { x: 1 }, value: '$vars.x' }
      expect(build(scoped, ['value'])!.readResult(5)).toBeNull()
    })
  })

  describe("that can't be built", () => {
    it('is null inside an iterator with no input, such as one held back by a typo', () => {
      const expression = { operator: 'map', inptu: '$data.list', each: { $upper: '$element' } }
      expect(build(expression, ['each'])).toBeNull()
      // The iterator itself still evaluates, and fails as it should
      expect(build(expression, [])).not.toBeNull()
    })

    it('is null inside an iterator where no `map` is registered', () => {
      const withoutMap = new FigTree({
        operators: [coreOperators.filter(({ name }) => name !== 'map')],
      }).getOperators()
      const expression = { operator: 'filter', input: [1], each: { $greaterThan: ['$element', 0] } }
      expect(buildSubTree(expression, ['each'], contextFor(expression, withoutMap))).toBeNull()
      expect(buildSubTree(expression, [], contextFor(expression, withoutMap))).not.toBeNull()
    })

    it('is null at a path no longer in the tree', () => {
      expect(build({ a: 1 }, ['b'])).toBeNull()
    })
  })
})

describe('the errors that block an evaluation', () => {
  const blocking = (expression: unknown, path: Path) =>
    blockingErrors(path, figTree.validate(expression).issues, contextFor(expression)).map(
      ({ path: at }) => at
    )

  it('are those at or under the row, and not elsewhere', () => {
    const expression = { a: { $plus: [1, { $upper: 5 }] }, b: { $upper: 6 } }
    expect(blocking(expression, ['a'])).toEqual([['a', '$plus', 1, '$upper']])
    expect(blocking(expression, ['a', '$plus', 0])).toEqual([])
  })

  it("don't include warnings", () => {
    const expression = { a: { style: { $colour: 'red' } } }
    expect(figTree.validate(expression).issues).toHaveLength(1)
    expect(blocking(expression, ['a'])).toEqual([])
  })

  it("include one in a wrapped block, in a var the row doesn't read", () => {
    const expression = { vars: { unused: { $upper: 5 } }, value: { $plus: [1, 2] } }
    expect(blocking(expression, ['value'])).toEqual([['vars', 'unused', '$upper']])
  })

  it("include one in a wrapped iterator's input", () => {
    // `upper` takes a string, and returns one where `map` takes an array
    const expression = { operator: 'map', input: { $upper: 5 }, each: '$element' }
    expect(blocking(expression, ['each'])).toEqual([['input'], ['input', '$upper']])
    // The input itself is outside the iterator: the iterator's own errors
    // don't count
    const badAs = { ...expression, as: 5 }
    expect(blocking(badAs, ['input'])).toEqual([['input'], ['input', '$upper']])
    expect(blocking(badAs, ['each'])).toContainEqual(['as'])
  })

  it('are every error, at the root', () => {
    const expression = { a: { $upper: 5 }, b: { $upper: 6 } }
    expect(blocking(expression, [])).toHaveLength(2)
  })
})
