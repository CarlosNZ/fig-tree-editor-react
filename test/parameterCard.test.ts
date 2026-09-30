import { FigTree, coreOperators, httpOperators, type OperatorInfo } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { classify, rowAt } from '../src/classify'
import { operatorDefaultsLine, parameterCard } from '../src/parameterCard'
import { type Path } from '../src/paths'
import { parameterSlot } from '../src/slots'
import { registry } from './fixtures'

type Registry = { operators: OperatorInfo[]; fragments: typeof registry.fragments }

const cardAt = (expression: unknown, path: Path, from: Registry = registry) => {
  const classification = classify(expression, from)
  const row = rowAt(classification, path)
  const owner = row?.slot?.ownerPath ? rowAt(classification, row.slot.ownerPath)?.kind : undefined
  const operator =
    owner?.kind === 'operator'
      ? from.operators.find(({ name }) => name === owner.operator)
      : undefined
  return parameterCard(row, operator)
}

// The card less its description, which is the declaration's own
const linesAt = (expression: unknown, path: Path, from?: Registry) => {
  const card = cardAt(expression, path, from)
  return card && [card[0], ...card.slice(2)]
}

const instance = (options: ConstructorParameters<typeof FigTree>[0]) => {
  const figTree = new FigTree({ operators: [coreOperators, httpOperators()], ...options })
  return { operators: figTree.getOperators(), fragments: figTree.getFragments() }
}

describe('parameterCard', () => {
  it('starts with the name, whether it is required, what it takes, and the description', () => {
    const card = cardAt({ operator: 'round', value: 1, decimals: 2 }, ['decimals'])!
    const round = registry.operators.find(({ name }) => name === 'round')!
    expect(card.slice(0, 2)).toEqual([
      '`decimals` · optional · takes an integer',
      round.parameters.decimals.description,
    ])
  })

  it.each<[string, unknown, Path, string[]]>([
    [
      '`round.value`',
      { operator: 'round', value: 1 },
      ['value'],
      ['`value` · required · takes a number or null', 'If null: the result is null'],
    ],
    [
      '`round.decimals`',
      { operator: 'round', value: 1, decimals: 2 },
      ['decimals'],
      [
        '`decimals` · optional · takes an integer',
        'Default: 0',
        "If null: means 'not set', so the default applies",
      ],
    ],
    [
      '`if.then`, whose null is a value',
      { operator: 'if', condition: true, then: 1 },
      ['then'],
      ['`then` · required · takes anything', 'Evaluated: only when needed'],
    ],
    [
      '`and.values`',
      { operator: 'and', values: [true] },
      ['values'],
      [
        '`values` · required · takes an array',
        'Evaluated: all at once; stops as soon as the answer is known',
        'If null: a null element counts as false',
      ],
    ],
    [
      '`greaterThan.values`',
      { operator: 'greaterThan', values: [2, 1] },
      ['values'],
      [
        '`values` · required · takes an array',
        'Elements: exactly 2, all numbers or all strings',
        'If null: the result is null; a null element makes the result null unless `nullValueDefault` is set',
      ],
    ],
    [
      '`plus.nullValueDefault`',
      { operator: 'plus', values: [1], nullValueDefault: 0 },
      ['nullValueDefault'],
      [
        '`nullValueDefault` · optional · takes a number, a string, an array or an object',
        'Evaluated: only when needed',
        "If null: means 'not set'",
        'Used in place of a null in `values`',
      ],
    ],
    [
      '`map.input`',
      { operator: 'map', input: [1], each: 1 },
      ['input'],
      [
        '`input` · required · takes an array',
        'If null: the result is null unless `nullInputDefault` is set',
      ],
    ],
    [
      '`map.each`',
      { operator: 'map', input: [1], each: 1 },
      ['each'],
      [
        '`each` · required · takes anything',
        'Evaluated: once for each element of `input`, with `$element` and `$index` available',
      ],
    ],
    [
      '`map.each` under `as`',
      { operator: 'map', input: [1], each: 1, as: 'item' },
      ['each'],
      [
        '`each` · required · takes anything',
        'Evaluated: once for each element of `input`, with `$item` and `$itemIndex` available',
      ],
    ],
    [
      '`buildObject.entries`',
      { operator: 'buildObject', entries: [] },
      ['entries'],
      [
        '`entries` · required · takes an array',
        'Elements: each an object with `key` and `value`',
        'If null: the result is null',
      ],
    ],
    [
      '`get.from`',
      { operator: 'get', path: 'a', from: {} },
      ['from'],
      ['`from` · optional · takes anything', 'Default: the evaluation data'],
    ],
    [
      "`convert.value`'s conditional policy",
      { operator: 'convert', value: 1, to: 'string' },
      ['value'],
      [
        '`value` · required · takes anything',
        "If null: if `to` is 'boolean', null is used as a value; otherwise the result is null",
      ],
    ],
    [
      'a named payload',
      { $round: { value: 1, decimals: 2 } },
      ['$round', 'decimals'],
      [
        '`decimals` · optional · takes an integer',
        'Default: 0',
        "If null: means 'not set', so the default applies",
      ],
    ],
  ])('words %s', (_, expression, path, lines) => {
    expect(linesAt(expression, path)).toEqual(lines)
  })

  it("words a fragment's argument, which has no evaluation or description", () => {
    expect(
      cardAt({ fragment: 'getFlag', parameters: { country: 'Chile' } }, ['parameters', 'country'])
    ).toEqual([
      '`country` · optional · takes a string',
      "Default: 'New Zealand'",
      "If null: means 'not set', so the default applies",
    ])
  })

  it("names the instance's default beside FigTree's", () => {
    const from = instance({ operatorDefaults: { round: { decimals: 2 }, http: { timeout: 5000 } } })
    expect(linesAt({ operator: 'round', value: 1, decimals: 3 }, ['decimals'], from)).toContain(
      "Default here: 2 (set by this application; FigTree's is 0)"
    )
    expect(
      linesAt({ operator: 'http', url: 'https://a.b', timeout: 1 }, ['timeout'], from)
    ).toContain('Default here: 5000 (set by this application)')
  })

  it('has no description line where the declaration has none', () => {
    const declaration = { type: 'string' as const, required: true }
    const card = parameterCard(
      { slot: parameterSlot(['a'], [], 'a', declaration), scope: [] },
      undefined
    )
    expect(card).toEqual(['`a` · required · takes a string', 'If null: an error'])
  })

  it('describes the modifiers and the vars block', () => {
    const node = { operator: 'round', value: 1, fallback: 0, useCache: true, vars: {} }
    expect(cardAt(node, ['fallback'])).toEqual([
      '`fallback` · optional · takes anything',
      'The value to use if this node fails',
    ])
    expect(cardAt(node, ['useCache'])).toEqual([
      '`useCache` · optional · takes a boolean',
      "Cache this node's result",
    ])
    expect(cardAt(node, ['vars'])).toEqual([
      '`vars`',
      'Named values for this node and everything inside it',
    ])
  })

  it.each<[string, unknown, Path]>([
    ['an array element', { operator: 'plus', values: [1] }, ['values', 0]],
    ['a var', { operator: 'round', value: 1, vars: { a: 1 } }, ['vars', 'a']],
    ['an unknown key', { operator: 'round', value: 1, valu: 2 }, ['valu']],
    ['plain data', { operator: 'if', condition: true, then: { a: 1 } }, ['then', 'a']],
    [
      "an element shape's field",
      { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
      ['entries', 0, 'key'],
    ],
  ])('gives no card to %s', (_, expression, path) => {
    expect(cardAt(expression, path)).toBeNull()
  })
})

describe('operatorDefaultsLine', () => {
  const from = instance({ operatorDefaults: { http: { fallback: null, timeout: 5000 } } })
  const http = from.operators.find(({ name }) => name === 'http')!

  it("lists what the instance sets on every node that doesn't set its own", () => {
    expect(operatorDefaultsLine(http, { operator: 'http', url: 'https://a.b' })).toBe(
      "This application sets `fallback: null` and `timeout: 5000` on every `http` node that doesn't set its own"
    )
    expect(operatorDefaultsLine(http, { operator: 'http', url: 'https://a.b', timeout: 1 })).toBe(
      "This application sets `fallback: null` on every `http` node that doesn't set its own"
    )
  })

  it('is left out where the instance sets nothing', () => {
    const plus = registry.operators.find(({ name }) => name === 'plus')!
    expect(operatorDefaultsLine(plus, { operator: 'plus', values: [1] })).toBeUndefined()
  })
})
