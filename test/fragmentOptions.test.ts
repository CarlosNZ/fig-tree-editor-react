import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { buildDisplayData } from '../src/displayData'
import { fragmentOptions } from '../src/fragmentOptions'

// Registered in this order, which the list keeps: fig-tree infers `today` to
// return a string and `count` a number
const figTree = new FigTree({
  fragments: {
    today: {
      expression: 'Monday',
      description: "Today's name",
      metadata: { displayName: 'Day of the week' },
    },
    count: { expression: 3, description: 'How many' },
    anything: { expression: { operator: 'get', path: 'x' } },
  },
})
const fragments = figTree.getFragments()
const displayData = buildDisplayData({ operators: figTree.getOperators(), fragments })

const options = (
  admits: Parameters<typeof fragmentOptions>[0]['admits'],
  current = null as string | null
) => fragmentOptions({ fragments, displayData, admits, current })

describe('fragmentOptions', () => {
  it("lists every fragment in the host's order, under no heading", () => {
    const [group, ...rest] = options('any')
    expect(rest).toEqual([])
    expect(group.label).toBeUndefined()
    expect(group.options.map(({ value }) => value)).toEqual(['today', 'count', 'anything'])
  })

  it('labels each by its display name, or its name, with its description, and searches its name', () => {
    const [today, count] = options('any')[0].options
    expect(today).toMatchObject({
      label: 'Day of the week',
      description: "Today's name",
      keywords: 'today',
      disabled: false,
    })
    expect(count).toMatchObject({ label: 'count', description: 'How many', keywords: 'count' })
  })

  it('moves the fragments that cannot fit to "Not valid here", with the reason', () => {
    const [valid, notValid] = options(['number', 'null'])
    expect(valid.options.map(({ value }) => value)).toEqual(['count', 'anything'])
    expect(notValid.label).toBe('Not valid here')
    expect(notValid.options).toEqual([
      expect.objectContaining({
        value: 'today',
        disabled: true,
        description: 'Returns a string; this position takes a number or null',
      }),
    ])
  })

  it('keeps the current fragment choosable where it cannot fit', () => {
    const [valid] = options('number', 'today')
    expect(valid.options.map(({ value }) => value)).toEqual(['today', 'count', 'anything'])
    expect(valid.options[0].disabled).toBe(false)
  })

  it('has no groups where nothing is registered', () => {
    expect(fragmentOptions({ fragments: [], displayData, admits: 'any', current: null })).toEqual(
      []
    )
  })
})
