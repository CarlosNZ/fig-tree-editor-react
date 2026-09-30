import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { buildDisplayData } from '../src/displayData'
import { getStartingFragment } from '../src/getStartingFragment'

// fig-tree infers `today` to return a string, `count` a number and `lookup`
// anything
const figTree = new FigTree({
  fragments: {
    today: { expression: 'Monday' },
    count: { expression: 3 },
    lookup: { expression: { operator: 'get', path: 'x' } },
  },
})
const fragments = figTree.getFragments()
const displayData = buildDisplayData({ operators: figTree.getOperators(), fragments })

const start = (admits: Parameters<typeof getStartingFragment>[0], defaultFragment?: string) =>
  getStartingFragment(admits, { fragments, displayData, defaultFragment })

describe('getStartingFragment', () => {
  it("starts as the host's default where it is registered and can fit", () => {
    expect(start('any', 'lookup')).toEqual({ fragment: 'lookup' })
    expect(start('number', 'count')).toEqual({ fragment: 'count' })
  })

  it('otherwise starts as the first fragment in order that can fit', () => {
    expect(start('any')).toEqual({ fragment: 'today' })
    expect(start('number')).toEqual({ fragment: 'count' })
    expect(start('number', 'today')).toEqual({ fragment: 'count' })
    expect(start('any', 'nope')).toEqual({ fragment: 'today' })
  })

  it('is null where no fragment can fit, or none is registered', () => {
    const [today] = fragments
    expect(getStartingFragment('number', { fragments: [today], displayData })).toBeNull()
    expect(getStartingFragment('any', { fragments: [], displayData })).toBeNull()
  })
})
