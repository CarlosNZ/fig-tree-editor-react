import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { getQuickFixes } from '../src/quickFixes'
import { figTree, registry } from './fixtures'

// The fixes offered on each issue `validate()` reports, as [code, labels]
const offered = (expression: unknown) =>
  figTree.validate(expression).issues.map((issue) => [
    issue.code,
    getQuickFixes(issue, expression, {
      ...registry,
      classification: classify(expression, registry),
    }).map(({ label }) => label),
  ])

// The expression with the fix labelled `label` on the first issue with
// `code` applied
const fixed = (expression: unknown, code: string, label: string, to: unknown = expression) => {
  const issue = figTree.validate(expression).issues.find((issue) => issue.code === code)!
  const fix = getQuickFixes(issue, expression, {
    ...registry,
    classification: classify(expression, registry),
  }).find((fix) => fix.label === label)!
  return fix.fix(to)
}

describe('quick fixes', () => {
  describe('on an unknown key', () => {
    it('renames it to the suggestion, or removes it', () => {
      expect(offered({ operator: 'if', condition: true, thn: 'Adult' })).toEqual([
        ['unknown-node-key', ['Rename to then', 'Remove']],
        ['missing-required', []],
      ])
    })

    it('renames it in place, keeping its value', () => {
      const expression = { age: { operator: 'if', condition: true, thn: 'Adult', else: 'Child' } }
      const result = fixed(expression, 'unknown-node-key', 'Rename to then')
      expect(result).toEqual({
        age: { operator: 'if', condition: true, then: 'Adult', else: 'Child' },
      })
      expect(Object.keys((result as { age: object }).age)).toEqual([
        'operator',
        'condition',
        'then',
        'else',
      ])
    })

    it("doesn't rename it onto a key that is there already", () => {
      expect(offered({ operator: 'if', condition: true, then: 1, thn: 2 })).toEqual([
        ['unknown-node-key', ['Remove']],
      ])
    })

    it('removes it, where fig-tree suggests nothing', () => {
      const expression = { operator: 'plus', values: [1], fallbak: 0 }
      expect(offered(expression)).toEqual([['unknown-node-key', ['Remove']]])
      expect(fixed(expression, 'unknown-node-key', 'Remove')).toEqual({
        operator: 'plus',
        values: [1],
      })
    })
  })

  describe('on a key that does not belong on its node', () => {
    it.each([
      [{ $plus: [1], extra: 2 }, { $plus: [1] }],
      [{ $plus: 1, $minus: 2 }, { $plus: 1 }],
      [{ $greet: { name: 'Ada' }, useCache: true }, { $greet: { name: 'Ada' } }],
      [
        { operator: 'plus', values: [1], parameters: {} },
        { operator: 'plus', values: [1] },
      ],
      [
        { fragment: 'greet', parameters: { name: 'Ada' }, noCache: false },
        { fragment: 'greet', parameters: { name: 'Ada' } },
      ],
    ])('removes it: %j', (expression, result) => {
      expect(fixed(expression, 'malformed-node', 'Remove')).toEqual(result)
    })

    it("offers nothing on a node's own `$name`, which holds its content", () => {
      expect(offered({ $greet: '$data.x' })).toEqual([
        ['malformed-node', []],
        ['missing-required', []],
      ])
    })

    it('offers nothing on a node that is itself malformed', () => {
      expect(offered({ operator: 42 })).toEqual([['malformed-node', []]])
      expect(offered({ operator: 'plus', fragment: 'greet', values: [1] })).toEqual([
        ['malformed-node', []],
      ])
    })
  })

  describe('on an unknown operator or fragment', () => {
    it('changes it to the suggestion, as the picker would, cleaning the node', () => {
      const expression = { total: { operator: 'plsu', values: [1], extra: 2, fallback: 0 } }
      expect(offered(expression)).toEqual([['unknown-operator', ['Change to plus']]])
      expect(fixed(expression, 'unknown-operator', 'Change to plus')).toEqual({
        total: { operator: 'plus', values: [1], fallback: 0 },
      })
    })

    it('changes a fragment call', () => {
      const expression = { fragment: 'geet', parameters: { name: 'Ada', age: 3 } }
      expect(offered(expression)).toEqual([['unknown-fragment', ['Change to greet']]])
      expect(fixed(expression, 'unknown-fragment', 'Change to greet')).toEqual({
        fragment: 'greet',
        parameters: { name: 'Ada' },
      })
    })

    it('offers nothing without a suggestion', () => {
      expect(offered({ operator: 'zzzzz', values: [1] })).toEqual([['unknown-operator', []]])
    })
  })

  describe('on a `$` key that names nothing', () => {
    it('renames it to the suggestion', () => {
      const expression = { condition: { $graeterThan: [1, 2] } }
      expect(offered(expression)).toEqual([['unrecognized-identifier', ['Rename to $greaterThan']]])
      expect(fixed(expression, 'unrecognized-identifier', 'Rename to $greaterThan')).toEqual({
        condition: { $greaterThan: [1, 2] },
      })
    })
  })

  it('offers nothing on other issues', () => {
    expect(offered({ $upper: 5 })).toEqual([['type-check', []]])
  })

  it('leaves the expression as it is where its target has gone', () => {
    const expression = { operator: 'if', condition: true, thn: 'Adult' }
    const gone = { operator: 'if', condition: true, then: 'Adult' }
    expect(fixed(expression, 'unknown-node-key', 'Rename to then', gone)).toBe(gone)
    expect(fixed(expression, 'unknown-node-key', 'Remove', gone)).toBe(gone)
  })
})
