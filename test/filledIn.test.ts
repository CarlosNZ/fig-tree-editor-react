import { describe, expect, it } from 'vitest'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { classify } from '../src/classify'
import { buildDisplayData } from '../src/displayData'
import { fillAndTidy } from '../src/fillAndTidy'
import {
  confirmFilledIn,
  dismissFilledIn,
  NO_FILLED_IN,
  recordFilledIn,
  standingFilledIn,
  type FilledInRecord,
} from '../src/filledIn'
import { displayPath } from '../src/paths'

const figTree = new FigTree({
  operators: [coreOperators],
  fragments: {
    greet: {
      expression: { $plus: ['Hello ', '$params.name'] },
      parameters: { name: { type: 'string', required: true } },
    },
  },
})
const registry = { operators: figTree.getOperators(), fragments: figTree.getFragments() }
const displayData = buildDisplayData(registry)

const THEN = 'The condition is true' // `if.then`'s seed

// An expression as it arrives, filled in, with the record of what was added
const arrive = (expression: unknown, record = NO_FILLED_IN) => {
  const { expression: filled, filled: paths } = fillAndTidy(expression, {
    ...registry,
    displayData,
    issues: figTree.validate(expression).issues,
  })
  return {
    expression: filled,
    record: recordFilledIn(record, paths, filled, classify(filled, registry)),
  }
}

// Each standing line as [row, message]
const standing = (record: FilledInRecord, expression: unknown) =>
  standingFilledIn(record, expression, classify(expression, registry)).map(({ row, message }) => [
    displayPath(row),
    message,
  ])

describe('the filled-in record', () => {
  it('records each value added, by its canonical path, worded for its node', () => {
    const { record } = arrive({ x: { $if: [true] } })
    expect([...record.values()]).toEqual([
      { path: ['x', 'then'], value: THEN, message: "Added 'then', which 'if' requires" },
    ])
  })

  it("words a fragment's argument, and a `literal`'s value", () => {
    const { record } = arrive({ a: { fragment: 'greet' }, b: { operator: 'literal' } })
    expect([...record.values()].map(({ message }) => message)).toEqual([
      "Added 'name', which fragment 'greet' requires",
      "Added 'value', which 'literal' requires",
    ])
  })

  it('names the node as written', () => {
    const { record } = arrive({ operator: '?', condition: true })
    expect([...record.values()][0].message).toBe("Added 'then', which '?' requires")
  })

  it('adds to what it holds, replacing an entry for the same row', () => {
    const first = arrive({ a: { operator: 'if', condition: true } })
    const { record } = arrive(
      { a: { operator: 'if', condition: true }, b: { operator: 'if', condition: false } },
      first.record
    )
    expect([...record.keys()]).toHaveLength(2)
  })

  describe('its lines', () => {
    it('stand while their rows hold the values added', () => {
      const { expression, record } = arrive({ operator: 'if', condition: true })
      expect(standing(record, expression)).toEqual([['then', "Added 'then', which 'if' requires"]])
    })

    it('hide while a row holds something else, or is gone, and come back with the value', () => {
      const { record } = arrive({ operator: 'if', condition: true })
      expect(standing(record, { operator: 'if', condition: true, then: 'Yes' })).toEqual([])
      expect(standing(record, { operator: 'and', values: [true] })).toEqual([])
      expect(standing(record, { operator: 'if', condition: true, then: THEN })).toHaveLength(1)
    })

    it('follow a row through a conversion', () => {
      const { record } = arrive({ x: { operator: 'if', condition: true } })
      expect(standing(record, { x: { $if: [true, THEN] } })).toEqual([
        ['x.$if[1]', "Added 'then', which 'if' requires"],
      ])
      expect(standing(record, { x: { $if: { condition: true, then: THEN } } })).toEqual([
        ['x.$if.then', "Added 'then', which 'if' requires"],
      ])
    })

    it('compare a collection by its content', () => {
      const { expression, record } = arrive({ operator: 'plus' })
      expect(standing(record, structuredClone(expression))).toHaveLength(1)
    })
  })

  describe('leaving it', () => {
    const { record } = arrive({ x: { operator: 'plus' } }) // `values: [1, 2, 3]`

    it('goes with an edit committed on the row, or on a row inside it', () => {
      expect(confirmFilledIn(record, ['x', 'values']).size).toBe(0)
      expect(confirmFilledIn(record, ['x', 'values', 0]).size).toBe(0)
    })

    it('stays through an edit of the node holding the row, or of another row', () => {
      expect(confirmFilledIn(record, ['x'])).toBe(record)
      expect(confirmFilledIn(record, ['y'])).toBe(record)
    })

    it('goes when dismissed', () => {
      expect(dismissFilledIn(record, [...record.keys()][0]).size).toBe(0)
    })
  })
})
