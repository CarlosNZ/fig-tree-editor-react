import { describe, expect, it } from 'vitest'
import { classify, rowAt } from '../src/classify'
import { type Path } from '../src/paths'
import { registry } from './fixtures'

const slotAt = (expression: unknown, path: Path) =>
  rowAt(classify(expression, registry), path)?.slot

// The design's "How positions resolve" table (topic 4, "Slots"), row by row
describe('slots', () => {
  it.each([
    [{ operator: 'round', value: 3.14 }, ['value']],
    [{ $round: { value: 3.14 } }, ['$round', 'value']],
    [{ $round: [3.14, 1] }, ['$round', 0]],
  ])('resolve a parameter, in any form: %j', (expression, path) => {
    expect(slotAt(expression, path)).toMatchObject({
      role: 'parameter',
      parameter: 'value',
      ownerPath: [],
      admits: ['number', 'null'],
      literalOnly: false,
    })
  })

  it('bind positional arguments in order', () => {
    expect(slotAt({ $round: [3.14, 1] }, ['$round', 1])).toMatchObject({
      parameter: 'decimals',
      admits: 'integer',
    })
  })

  it('bind a single value to the first position, or to the whole rest parameter', () => {
    expect(slotAt({ $not: true }, ['$not'])).toMatchObject({ parameter: 'value', admits: 'any' })
    expect(slotAt({ $and: '$data.list' }, ['$and'])).toMatchObject({
      role: 'parameter',
      parameter: 'values',
      admits: 'array',
    })
  })

  describe('elements', () => {
    it('are the elements of an array parameter, in either form', () => {
      const element = { role: 'element', parameter: 'values', ownerPath: [], admits: 'any' }
      expect(slotAt({ $and: [true] }, ['$and', 0])).toMatchObject(element)
      expect(slotAt({ operator: 'and', values: [true] }, ['values', 0])).toMatchObject(element)
    })

    it('admit the homogeneous types, and null where the container declares it', () => {
      expect(slotAt({ $greaterThan: ['$data.age', 18] }, ['$greaterThan', 1])?.admits).toEqual([
        'number',
        'string',
        'null',
      ])
      expect(slotAt({ $plus: [1, 2] }, ['$plus', 0])?.admits).toEqual([
        'number',
        'string',
        'array',
        'object',
        'null',
      ])
    })

    it("take their positions after a positional parameter's", () => {
      const node = { $buildString: ['Hello %1', 'World'] }
      expect(slotAt(node, ['$buildString', 0])).toMatchObject({ parameter: 'template' })
      expect(slotAt(node, ['$buildString', 1])).toMatchObject({
        role: 'element',
        parameter: 'substitutions',
      })
    })

    it('are an object of fields under an `elementShape`', () => {
      const node = { $buildObject: [{ key: 'a', value: 1, extra: 2 }] }
      expect(slotAt(node, ['$buildObject', 0])).toMatchObject({
        role: 'element',
        admits: ['object'],
      })
      expect(slotAt(node, ['$buildObject', 0, 'key'])).toMatchObject({
        role: 'field',
        parameter: 'key',
        ownerPath: [],
        admits: ['string', 'number', 'boolean'],
      })
      expect(slotAt(node, ['$buildObject', 0, 'value'])).toMatchObject({
        role: 'field',
        admits: 'any',
      })
      expect(slotAt(node, ['$buildObject', 0, 'extra'])).toMatchObject({ role: 'data' })
    })

    it('are plain data in an array parameter that takes no array', () => {
      expect(slotAt({ $if: [true, [1, 2], 3] }, ['$if', 1, 0])).toMatchObject({ role: 'data' })
    })
  })

  it('record an owner one to four levels up', () => {
    const owner = (expression: unknown, path: Path) => slotAt(expression, path)?.ownerPath
    const at = ['at']
    expect(owner({ at: { $round: [1, 2] } }, [...at, '$round', 1])).toEqual(at)
    expect(owner({ at: { operator: 'round', decimals: 2 } }, [...at, 'decimals'])).toEqual(at)
    expect(owner({ at: { $not: true } }, [...at, '$not'])).toEqual(at)
    expect(owner({ at: { $multiply: [1, 2] } }, [...at, '$multiply', 0])).toEqual(at)
    expect(owner({ at: { operator: 'multiply', values: [1] } }, [...at, 'values', 0])).toEqual(at)
    const entry = { key: 'k', value: 'v' }
    expect(
      owner({ at: { operator: 'buildObject', entries: [entry] } }, [...at, 'entries', 0, 'key'])
    ).toEqual(at)
    expect(
      owner({ at: { $buildObject: { entries: [entry] } } }, [
        ...at,
        '$buildObject',
        'entries',
        0,
        'key',
      ])
    ).toEqual(at)
  })

  it("resolve a literal `lazyEntries` map's values as entries, and its keys as data", () => {
    const node = { operator: 'match', value: '$data.k', branches: { a: 1, b: '$data.b' } }
    expect(slotAt(node, ['branches'])).toMatchObject({ role: 'parameter', admits: 'object' })
    expect(slotAt(node, ['branches', 'a'])).toMatchObject({
      role: 'entry',
      parameter: 'branches',
      admits: 'any',
    })
    expect(slotAt({ ...node, branches: '$data.map' }, ['branches'])).toMatchObject({
      role: 'parameter',
      admits: 'object',
    })
  })

  it("resolve a fragment's arguments from its declarations", () => {
    expect(
      slotAt({ fragment: 'greet', parameters: { name: 'Ada' } }, ['parameters', 'name'])
    ).toMatchObject({ role: 'parameter', parameter: 'name', admits: 'string', ownerPath: [] })
    expect(slotAt({ $greet: { nope: 1 } }, ['$greet', 'nope'])).toMatchObject({
      role: 'parameter',
      admits: 'any',
    })
    expect(slotAt({ $greet: { nope: 1 } }, ['$greet', 'nope'])).not.toHaveProperty(
      'declaration.type'
    )
    expect(slotAt({ fragment: 'greet', parameters: '$data.x' }, ['parameters'])).toMatchObject({
      role: 'arguments',
      admits: 'object',
    })
  })

  it('resolve the modifiers and vars', () => {
    const node = { $plus: [1], fallback: 0, useCache: true, vars: { price: 5 } }
    expect(slotAt(node, ['fallback'])).toMatchObject({ role: 'modifier', admits: 'any' })
    expect(slotAt(node, ['useCache'])).toMatchObject({
      role: 'modifier',
      admits: 'boolean',
      literalOnly: true,
    })
    expect(slotAt(node, ['vars', 'price'])).toMatchObject({ role: 'var', admits: 'any' })
  })

  it('resolve `as` as a literal-only name', () => {
    expect(slotAt({ $map: { input: [], as: 'x', each: 1 } }, ['$map', 'as'])).toMatchObject({
      role: 'parameter',
      admits: 'string',
      literalOnly: true,
    })
  })

  it('resolve the root, and plain data in an evaluated position', () => {
    expect(slotAt(1, [])).toMatchObject({ role: 'root', ownerPath: null, admits: 'any' })
    const node = { operator: 'http', url: 'x', body: { name: '$data.n' } }
    expect(slotAt(node, ['body', 'name'])).toMatchObject({ role: 'data', ownerPath: [] })
    expect(slotAt({ title: '$data.t' }, ['title'])).toMatchObject({ role: 'data', ownerPath: null })
  })

  it('leave the unevaluated rows without one', () => {
    const none = (expression: unknown, path: Path) =>
      expect(slotAt(expression, path)).toBeUndefined()
    none({ operator: 'plus', values: [1] }, ['operator'])
    none({ fragment: 'greet' }, ['fragment'])
    none({ $plus: [1] }, ['$plus'])
    none({ $if: { condition: true } }, ['$if'])
    none({ fragment: 'greet', parameters: { name: 'x' } }, ['parameters'])
    none({ $plus: [1], vars: { x: 1 } }, ['vars'])
    none({ $plus: [1], '//': 'note' }, ['//'])
    none({ operator: 'literal', value: { a: 1 } }, ['value'])
    none({ operator: 'literal', value: { a: 1 } }, ['value', 'a'])
  })
})
