import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { buildDisplayData } from '../src/displayData'
import { type Path } from '../src/paths'
import { nodeTypes, switchNodeType, type NodeType } from '../src/switchNodeType'

// fig-tree infers `today` to return a string, and `greet` what `plus` does
const figTree = new FigTree({
  fragments: {
    today: { expression: 'Monday' },
    greet: {
      expression: { $plus: ['Hello ', '$params.name'] },
      parameters: { name: { type: 'string' } },
    },
  },
})
const registry = { operators: figTree.getOperators(), fragments: figTree.getFragments() }
const displayData = buildDisplayData(registry)

const contextFor = (expression: unknown, fragments = registry.fragments) => ({
  classification: classify(expression, registry),
  operators: registry.operators,
  fragments,
  displayData,
})

const switchAt = (expression: unknown, path: Path, target: NodeType) => {
  const node = path.reduce<unknown>(
    (value, key) => (value as Record<string, unknown>)[key],
    expression
  ) as Record<string, unknown>
  return switchNodeType(node, target, path, contextFor(expression))
}

describe('switchNodeType', () => {
  it('switches an operator to the starting fragment, keeping the modifiers', () => {
    const node = {
      '//': 'why',
      operator: 'upper',
      value: 'x',
      fallback: 'y',
      noCache: true,
      vars: { a: 1 },
    }
    expect(switchAt(node, [], 'fragment')).toEqual({
      fragment: 'today',
      '//': 'why',
      fallback: 'y',
      noCache: true,
      vars: { a: 1 },
    })
  })

  it("switches a fragment call to the slot's default operator, keeping the modifiers", () => {
    const expression = {
      operator: 'round',
      value: { fragment: 'greet', parameters: { name: 'Ada' }, fallback: 0 },
    }
    expect(switchAt(expression, ['value'], 'operator')).toEqual({ operator: 'plus', fallback: 0 })
  })

  it('switches to the starting value for the position', () => {
    const round = { operator: 'round', value: 1, decimals: { operator: 'plus', values: [1] } }
    expect(switchAt(round, ['decimals'], 'value')).toBe(2)
    expect(switchAt({ operator: 'plus', values: [1] }, [], 'value')).toBe('Replace me')
    const lessThan = { operator: 'lessThan', values: [{ operator: 'plus', values: [1] }, 2] }
    expect(switchAt(lessThan, ['values', 0], 'value')).toBe(1)
  })

  it('offers Fragment only where a registered fragment can fit', () => {
    const round = { operator: 'round', value: { operator: 'plus', values: [1] } }
    expect(nodeTypes(['value'], contextFor(round))).toEqual(['operator', 'fragment', 'value'])
    const [today] = registry.fragments
    expect(nodeTypes(['value'], contextFor(round, [today]))).toEqual(['operator', 'value'])
    expect(nodeTypes([], contextFor({ operator: 'plus' }, []))).toEqual(['operator', 'value'])
  })
})
