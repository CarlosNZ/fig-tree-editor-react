import { describe, expect, it } from 'vitest'
import { classify, rowAt } from '../src/classify'
import { valueAt, type Path } from '../src/paths'
import { referenceStart, typeOptions } from '../src/typeOptions'
import { registry } from './fixtures'

const optionsAt = (expression: unknown, path: Path) =>
  typeOptions(rowAt(classify(expression, registry), path), valueAt(expression, path), expression)

const startAt = (namespace: 'data' | 'vars' | 'element', expression: unknown, path: Path) =>
  referenceStart(namespace, rowAt(classify(expression, registry), path), expression)

const STANDARD = ['string', 'number', 'boolean', 'null', 'object', 'array']
const OPTION = { enum: 'Option', values: ['test', 'extract', 'match'], matchPriority: 1 }

// The design's examples (topic 4, "The type dropdown"), less Fragment, which
// joins in Phase 7
describe('typeOptions', () => {
  it.each<[string, unknown, Path, unknown[]]>([
    [
      '`if.condition`',
      { operator: 'if', condition: true, then: 1 },
      ['condition'],
      [...STANDARD, 'Data', 'Operator'],
    ],
    [
      '`round.value`',
      { operator: 'round', value: 1 },
      ['value'],
      ['number', 'null', 'Data', 'Operator'],
    ],
    [
      '`round.decimals`',
      { operator: 'round', value: 1, decimals: 2 },
      ['decimals'],
      ['number', 'Data', 'Operator'],
    ],
    [
      '`regex.mode`',
      { operator: 'regex', value: 'a', pattern: 'a', mode: 'extract' },
      ['mode'],
      [OPTION, 'Data', 'Operator'],
    ],
    [
      'a `greaterThan` element',
      { operator: 'greaterThan', values: [1, 2] },
      ['values', 0],
      ['number', 'string', 'null', 'Data', 'Operator'],
    ],
    [
      'a `buildObject` entry',
      { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
      ['entries', 0],
      ['object', 'Data', 'Operator'],
    ],
    [
      '`map.each` in a vars scope',
      { operator: 'map', input: [1], each: 1, vars: { price: 2 } },
      ['each'],
      [...STANDARD, 'Data', 'Variable', 'Element', 'Operator'],
    ],
    ['`map.as`', { operator: 'map', input: [1], each: 1, as: 'item' }, ['as'], ['string']],
    ['`useCache`', { operator: 'plus', values: [1], useCache: true }, ['useCache'], ['boolean']],
    ['quoted content', { operator: 'literal', value: { a: 1 } }, ['value', 'a'], STANDARD],
  ])('offers %s its slot’s options', (_, expression, path, options) => {
    expect(optionsAt(expression, path)).toEqual(options)
  })

  it("lists the row's current type last, where the slot doesn't offer it", () => {
    expect(optionsAt({ operator: 'round', value: 'x' }, ['value'])).toEqual([
      'number',
      'null',
      'Data',
      'Operator',
      'string',
    ])
    expect(optionsAt({ operator: 'round', value: '$vars.nope' }, ['value'])).toEqual([
      'number',
      'null',
      'Data',
      'Operator',
      'Variable',
    ])
  })

  it('lists a reference that is offered once', () => {
    expect(optionsAt({ operator: 'round', value: '$data.price' }, ['value'])).toEqual([
      'number',
      'null',
      'Data',
      'Operator',
    ])
  })

  it('treats a value outside a literal union as its own type', () => {
    const regex = { operator: 'regex', value: 'a', pattern: 'a', mode: 'other' }
    expect(optionsAt(regex, ['mode'])).toEqual([OPTION, 'Data', 'Operator', 'string'])
  })
})

describe('referenceStart', () => {
  it('starts Data as the whole data object', () => {
    expect(startAt('data', { operator: 'round', value: 1 }, ['value'])).toBe('$data')
  })

  it('starts Variable as the first var of the nearest block that has one', () => {
    const expression = {
      operator: 'plus',
      values: [{ operator: 'round', value: 1, vars: { '//': 'none yet' } }],
      vars: { price: 2, tax: 3 },
    }
    expect(startAt('vars', expression, ['values', 0, 'value'])).toBe('$vars.price')
  })

  it("starts Element as the innermost iterator's element, by its `as` name", () => {
    const map = (each: unknown, as?: string) => ({ operator: 'map', input: [1], each, as })
    expect(startAt('element', map(1), ['each'])).toBe('$element')
    expect(startAt('element', map(map(1), 'order'), ['each', 'each'])).toBe('$element')
    expect(startAt('element', map(1, 'order'), ['each'])).toBe('$order')
  })
})
