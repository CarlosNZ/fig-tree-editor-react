import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { countMessages, orderMessages } from '../src/messageLines'
import { displayPath } from '../src/paths'
import { figTree, registry } from './fixtures'

// Each line as [row, code], in the list's order
const ordered = (expression: unknown, data?: Record<string, unknown>) =>
  orderMessages(
    figTree.validate(expression, data === undefined ? undefined : { data }).issues,
    expression,
    classify(expression, registry)
  ).map(({ row, issue }) => [displayPath(row), issue.code])

describe('the messages in tree order', () => {
  it("puts a node's own issue before its rows', where validate() reports it after", () => {
    const expression = { age: { operator: 'if', condition: true, thn: 1 } }
    expect(figTree.validate(expression).issues.map(({ code }) => code)).toEqual([
      'unknown-node-key',
      'missing-required',
    ])
    expect(ordered(expression)).toEqual([
      ['age', 'missing-required'],
      ['age.thn', 'unknown-node-key'],
    ])
  })

  it('puts a sample-data warning on its row, where validate() reports it last', () => {
    const expression = { name: '$data.user.nmae', rounded: { operator: 'round', value: [1] } }
    expect(ordered(expression, { user: { name: 'Ada' } })).toEqual([
      ['name', 'missing-data-path'],
      ['rounded.value', 'type-check'],
    ])
  })

  it('follows the keys and elements as they are held', () => {
    const expression = { b: [{ $upper: 5 }, { $upper: 6 }], a: { $upper: 7 } }
    expect(ordered(expression).map(([row]) => row)).toEqual([
      'b[0].$upper',
      'b[1].$upper',
      'a.$upper',
    ])
  })

  it('puts the most severe first on a row, then keeps the order validate() gives', () => {
    const expression = { values: [1] }
    const classification = classify(expression, registry)
    const issue = (severity: string, code: string) =>
      ({ severity, code, message: code, path: ['values'] }) as never
    const lines = orderMessages(
      [issue('hint', 'h'), issue('warning', 'w1'), issue('error', 'e'), issue('warning', 'w2')],
      expression,
      classification
    )
    expect(lines.map(({ issue }) => issue.code)).toEqual(['e', 'w1', 'w2', 'h'])
  })

  it('marks the row the issue shows on, not its own path', () => {
    // `missing-required` on a named payload's row shows on its node
    expect(ordered({ x: { $if: { condition: true } } })).toEqual([['x', 'missing-required']])
  })

  it('counts each severity', () => {
    const expression = {
      greeting: { $buildString: ['Hi %1 %3', 'Ada', 'Lovelace'] },
      x: { $upper: 5 },
    }
    const lines = orderMessages(
      figTree.validate(expression).issues,
      expression,
      classify(expression, registry)
    )
    expect(countMessages(lines)).toEqual({ errors: 1, warnings: 2, hints: 1 })
  })
})
