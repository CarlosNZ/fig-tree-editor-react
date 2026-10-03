import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { buildDisplayData } from '../src/displayData'
import { fillAndTidy, withoutHeldBack } from '../src/fillAndTidy'
import { demoExpressions, figTree, registry } from './fixtures'

const displayData = buildDisplayData(registry)
const run = (expression: unknown) =>
  fillAndTidy(expression, { ...registry, displayData, issues: figTree.validate(expression).issues })
const tidied = (expression: unknown) => run(expression).expression
const keys = (value: unknown) => Object.keys(value as object)

const THEN = 'The condition is true' // `if.then`'s seed

describe('fillAndTidy', () => {
  describe('filling', () => {
    it("adds a full node's missing required parameters", () => {
      expect(run({ operator: 'if', condition: true })).toEqual({
        expression: { operator: 'if', condition: true, then: THEN },
        filled: [['then']],
      })
    })

    it('adds them inside a named payload', () => {
      expect(run({ $if: { condition: true } })).toEqual({
        expression: { $if: { condition: true, then: THEN } },
        filled: [['$if', 'then']],
      })
    })

    it('appends them to an argument list, with every position before the last', () => {
      expect(run({ $if: [true] })).toEqual({
        expression: { $if: [true, THEN] },
        filled: [['$if', 1]],
      })
      const { expression, filled } = run({ $divide: [] })
      expect(expression).toEqual({ $divide: [expect.anything(), expect.anything()] })
      expect(filled).toEqual([
        ['$divide', 0],
        ['$divide', 1],
      ])
    })

    it('turns a single value into an argument list where later positions are required', () => {
      expect(run({ $if: '$data.x' })).toEqual({
        expression: { $if: ['$data.x', THEN] },
        filled: [['$if', 1]],
      })
      const complete = { $not: true }
      expect(tidied(complete)).toBe(complete)
      const whole = { $and: '$data.list' }
      expect(tidied(whole)).toBe(whole)
    })

    it('holds back a parameter an unknown key is a typo of', () => {
      const typo = { operator: 'if', condition: true, thn: 'x' }
      expect(run(typo)).toEqual({ expression: typo, filled: [] })
      expect(tidied({ $if: { condition: true, thn: 'x' } })).toEqual({
        $if: { condition: true, thn: 'x' },
      })
    })

    it("adds a static fragment call's required arguments, creating the map", () => {
      expect(run({ fragment: 'greet' })).toEqual({
        expression: { fragment: 'greet', parameters: { name: 'Replace me' } },
        filled: [['parameters', 'name']],
      })
      expect(tidied({ $greet: {} })).toEqual({ $greet: { name: 'Replace me' } })
      const dynamic = { fragment: 'greet', parameters: '$data.form' }
      expect(tidied(dynamic)).toBe(dynamic)
    })

    it('gives a literal its content', () => {
      expect(run({ operator: 'literal' })).toEqual({
        expression: { operator: 'literal', value: 'No content inside a literal node is evaluated' },
        filled: [['value']],
      })
    })

    it('fills nodes anywhere in the tree, at their own paths', () => {
      expect(run({ a: [{ $if: [true] }], vars: { v: { operator: 'if', condition: 1 } } })).toEqual({
        expression: {
          a: [{ $if: [true, THEN] }],
          vars: { v: { operator: 'if', condition: 1, then: THEN } },
        },
        filled: [
          ['a', 0, '$if', 1],
          ['vars', 'v', 'then'],
        ],
      })
    })

    it('leaves unknown operators and quoted content alone', () => {
      for (const expression of [
        { operator: 'flibble' },
        { operator: 'literal', value: { operator: 'if' } },
        { $literal: { operator: 'if' } },
        { '//': { operator: 'if' }, $plus: [1] },
      ])
        expect(tidied(expression)).toBe(expression)
    })
  })

  describe('ordering', () => {
    it("orders a node's keys, positional parameters first", () => {
      const node = {
        vars: { x: 1 },
        fallback: null,
        nullInputDefault: [],
        each: 1,
        as: 'a',
        input: [],
        mystery: true,
        operator: 'map',
        '//': 'Note',
      }
      expect(keys(tidied(node))).toEqual([
        '//',
        'operator',
        'input',
        'each',
        'as',
        'nullInputDefault',
        'mystery',
        'fallback',
        'vars',
      ])
      expect(keys(tidied({ from: {}, default: 1, path: 'a', operator: 'get' }))).toEqual([
        'operator',
        'path',
        'default',
        'from',
      ])
    })

    it('orders shorthand nodes, named payloads and fragment calls', () => {
      expect(keys(tidied({ vars: {}, $plus: [1], '//': 'x' }))).toEqual(['//', '$plus', 'vars'])
      const named = tidied({ $map: { each: 1, input: [] } }) as { $map: object }
      expect(keys(named.$map)).toEqual(['input', 'each'])
      expect(keys(tidied({ fallback: 1, parameters: { name: 'a' }, fragment: 'greet' }))).toEqual([
        'fragment',
        'parameters',
        'fallback',
      ])
    })

    it('keeps the order of plain objects and vars blocks', () => {
      const plain = { b: 1, a: '$data.a', vars: { z: 1, y: 2 } }
      expect(tidied(plain)).toBe(plain)
    })
  })

  it("removes nothing, which is cleanNode's", () => {
    const switched = { operator: 'upper', value: 'x', decimals: 2, thn: 1, fallback: null }
    expect(tidied(switched)).toBe(switched)
  })

  describe('identity', () => {
    it('returns what needs nothing unchanged, and keeps untouched subtrees', () => {
      const complete = { operator: 'if', condition: true, then: 'Yes' }
      expect(tidied(complete)).toBe(complete)
      const untouched = { $plus: [1, 2] }
      const result = tidied({ keep: untouched, fill: { $if: [true] } }) as { keep: unknown }
      expect(result.keep).toBe(untouched)
    })

    it.each(demoExpressions)('settles $name in one pass', ({ expression }) => {
      const once = tidied(expression)
      expect(tidied(once)).toBe(once)
    })
  })
})

describe('withoutHeldBack', () => {
  // Each issue shown, as its code and path, sorted
  const shown = (expression: unknown) =>
    withoutHeldBack(figTree.validate(expression).issues, classify(expression, registry))
      .map(({ code, path }) => `${code} ${JSON.stringify(path)}`)
      .sort()

  it('leaves out a missing parameter an unknown key is a typo of, in every form', () => {
    expect(shown({ operator: 'if', condition: true, thn: 'x' })).toEqual([
      'unknown-node-key ["thn"]',
    ])
    expect(shown({ $if: { condition: true, thn: 'x' } })).toEqual([
      'unknown-node-key ["$if","thn"]',
    ])
    expect(shown({ fragment: 'greet', parameters: { nmae: 'Ada' } })).toEqual([
      'unknown-node-key ["parameters","nmae"]',
    ])
    expect(shown({ $greet: { nmae: 'Ada' } })).toEqual(['unknown-node-key ["$greet","nmae"]'])
  })

  it("keeps a node's missing parameter where the typo is a nested node's", () => {
    expect(
      shown({ operator: 'if', condition: true, else: { operator: 'if', condition: true, thn: 1 } })
    ).toEqual(['missing-required []', 'unknown-node-key ["else","thn"]'])
  })

  it('keeps a missing parameter nothing is a typo of', () => {
    expect(shown({ operator: 'if', condition: true })).toEqual(['missing-required []'])
  })
})
