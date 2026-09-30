import { FigTree, coreOperators, defineOperator } from 'fig-tree-evaluator'
import { typeSeeds } from 'fig-tree-evaluator/editor-hints'
import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { buildDisplayData } from '../src/displayData'
import { getStartingElement, getStartingValue } from '../src/getStartingValue'
import { type Path } from '../src/paths'
import { registry } from './fixtures'

const displayData = buildDisplayData(registry)
const start = (operator: string, parameter: string) => {
  const declaration = registry.operators.find(({ name }) => name === operator)!.parameters[
    parameter
  ]
  return getStartingValue(parameter, declaration, displayData.operators[operator].seeds)
}

// The design's table (topic 4, "Adding parameters and starting values")
describe('getStartingValue', () => {
  it.each<[string, string, unknown, string]>([
    ['if', 'then', 'The condition is true', 'the seed'],
    ['round', 'decimals', 2, 'the seed'],
    ['split', 'trim', false, 'the seed'],
    ['http', 'timeout', 5000, 'the seed'],
    ['equal', 'caseInsensitive', true, 'the boolean type seed'],
    ['plus', 'expect', 'number', "the literal union's first member"],
    ['plus', 'nullValueDefault', 1, 'the type seed of the first non-null member'],
    ['find', 'noMatchDefault', 'Replace me', 'the any type seed'],
    ['regex', 'mode', 'extract', 'not the default'],
  ])('starts %s.%s as %j, from %s', (operator, parameter, value) => {
    expect(start(operator, parameter)).toEqual(value)
  })

  it('moves a boolean off its effective default, instance defaults included', () => {
    const declaration = { type: 'boolean' as const, required: false, default: true }
    expect(getStartingValue('flag', declaration, {})).toBe(false)
    expect(getStartingValue('flag', { ...declaration, instanceDefault: false }, {})).toBe(true)
  })

  it('never shares a seed object with the display data', () => {
    const seeds = { branches: { a: 1 } }
    const value = getStartingValue('branches', { type: 'object', required: true }, seeds)
    expect(value).toEqual(seeds.branches)
    expect(value).not.toBe(seeds.branches)
  })
})

const hostFigTree = new FigTree({
  operators: [
    coreOperators,
    defineOperator({
      name: 'weigh',
      category: 'other',
      description: 'Weighs named items',
      parameters: {
        items: {
          type: 'array',
          description: 'The items',
          constraints: {
            elementShape: {
              name: { type: 'string' },
              weight: { type: ['number', 'null'] },
              note: { type: 'string', required: false },
            },
          },
        },
        tags: {
          type: 'array',
          required: false,
          description: 'Strings or whole numbers',
          constraints: { homogeneous: ['string', 'integer'] },
        },
      },
      evaluate: () => null,
    }),
  ],
  fragments: {
    tally: {
      expression: { $plus: '$params.values' },
      parameters: { values: { type: 'array' } },
      metadata: { seeds: { values: [10, 20] } },
    },
  },
})
const hostRegistry = {
  operators: hostFigTree.getOperators(),
  fragments: hostFigTree.getFragments(),
}

const addTo = (expression: unknown, arrayPath: Path, from = registry) =>
  getStartingElement(arrayPath, valueAt(expression, arrayPath) as unknown[], {
    classification: classify(expression, from),
    operators: from.operators,
    displayData: buildDisplayData(from),
  })

const valueAt = (value: unknown, path: Path) =>
  path.reduce<unknown>((parent, key) => (parent as Record<string, unknown>)[key], value)

describe('getStartingElement', () => {
  // The design's table (topic 4, "An element added to an array")
  it.each<[string, unknown, Path, unknown]>([
    ['a homogeneous array of strings', { $min: ['apple', 'pear'] }, ['$min'], 'Replace me'],
    ['a homogeneous array of numbers', { $multiply: [5, 5] }, ['$multiply'], 1],
    ['no literal siblings, by the seed', { $min: ['$data.a', '$data.b'] }, ['$min'], 2],
    ["the seed's last", { $min: ['$data.a', '$data.b', '$data.c'] }, ['$min'], 2],
    ["the seed's last, on `and`", { $and: ['$data.a', '$data.b'] }, ['$and'], true],
    ["the seed's last, on `or`", { $or: ['$data.a', '$data.b'] }, ['$or'], false],
    ["`plus`'s numbers", { $plus: [1, 2] }, ['$plus'], 1],
    ['`join.values`', { operator: 'join', values: ['a', 'b'] }, ['values'], 'Charlie'],
    [
      '`firstOf.values`',
      { operator: 'firstOf', values: ['$data.x', '$data.y'] },
      ['values'],
      'The first non-null value',
    ],
    [
      '`buildObject.entries`',
      {
        operator: 'buildObject',
        entries: [
          { key: 'a', value: 1 },
          { key: 'b', value: 2 },
        ],
      },
      ['entries'],
      { key: 'secondKey', value: 'secondValue' },
    ],
    [
      'a plain array in an evaluated position',
      { operator: 'if', condition: true, then: [1, 2] },
      ['then'],
      'Replace me',
    ],
  ])('starts %s as %j', (_, expression, arrayPath, value) => {
    expect(addTo(expression, arrayPath)).toEqual(value)
  })

  it('leaves null siblings out of the shared type', () => {
    expect(addTo({ $plus: [null, 'a'] }, ['$plus'])).toBe('Replace me')
  })

  it('reads siblings of a type as fig-tree does', () => {
    const tags = (values: unknown[]) =>
      addTo({ operator: 'weigh', items: [], tags: values }, ['tags'], hostRegistry)
    expect(tags([3])).toBe(1) // an integer
    expect(tags([2.5])).toBe('Replace me') // no shared type, so the first admitted
  })

  it("starts a leading position as its parameter's own starting value", () => {
    expect(addTo({ $if: [true] }, ['$if'])).toBe('The condition is true')
    expect(addTo({ $round: [3.14] }, ['$round'])).toBe(2)
  })

  it('starts an element of a rest parameter after leading positions', () => {
    expect(addTo({ $buildString: ['Hello {{0}}'] }, ['$buildString'])).toBe('Replace me')
  })

  it('starts an element past the last position as anything', () => {
    expect(addTo({ $round: [3.14, 2] }, ['$round'])).toBe('Replace me')
  })

  it("reads a fragment's seeds", () => {
    const call = { fragment: 'tally', parameters: { values: [1] } }
    expect(addTo(call, ['parameters', 'values'], hostRegistry)).toBe(20)
  })

  it("starts an element shape's required fields", () => {
    const node = { operator: 'weigh', items: [] }
    expect(addTo(node, ['items'], hostRegistry)).toEqual({ name: 'Replace me', weight: 1 })
  })

  it('starts unevaluated content as anything', () => {
    expect(addTo({ operator: 'literal', value: [1, 2] }, ['value'])).toBe('Replace me')
    expect(addTo({ $literal: [1, 2] }, ['$literal'])).toBe('Replace me')
    expect(addTo({ '//': ['A note'], $plus: [1, 2] }, ['//'])).toBe('Replace me')
  })

  it('never shares an object with the display data or the type seeds', () => {
    const entries = [{ key: 'a', value: 1 }]
    const entry = addTo({ operator: 'buildObject', entries }, ['entries'])
    const seed = (displayData.operators.buildObject.seeds.entries as unknown[])[1]
    expect(entry).toEqual(seed)
    expect(entry).not.toBe(seed)
    const array = addTo({ $plus: [[1], [2]] }, ['$plus'])
    expect(array).toEqual([])
    expect(array).not.toBe(typeSeeds.array)
  })
})
