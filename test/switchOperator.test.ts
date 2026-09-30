import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { switchOperator } from '../src/switchOperator'

const operators = new FigTree().getOperators()
const switched = (node: Record<string, unknown>, target: string, current: string | null) =>
  switchOperator(node, target, current, operators)

describe('switchOperator', () => {
  it('keeps the parameters the new operator also declares, and the modifiers', () => {
    const node = {
      '//': 'why',
      operator: 'plus',
      values: [1, 2],
      fallback: 0,
      useCache: false,
      vars: { a: 1 },
    }
    expect(switched(node, 'multiply', 'plus')).toEqual({ ...node, operator: 'multiply' })
    expect(
      switched({ operator: 'map', input: [1], each: '$element', as: 'x' }, 'filter', 'map')
    ).toEqual({ operator: 'filter', input: [1], each: '$element', as: 'x' })
  })

  it('drops the parameters the new operator does not declare', () => {
    expect(switched({ operator: 'plus', values: [1, 2], thn: 1 }, 'round', 'plus')).toEqual({
      operator: 'round',
    })
  })

  it('keeps an alias spelling where the new operator has one, otherwise the name', () => {
    expect(switched({ operator: '+', values: [1] }, 'multiply', 'plus').operator).toBe('*')
    expect(switched({ operator: '+', values: [1] }, 'if', 'plus').operator).toBe('?')
    expect(switched({ operator: '+', values: [1] }, 'match', 'plus').operator).toBe('match')
    expect(switched({ operator: 'match' }, 'multiply', 'match').operator).toBe('multiply')
  })

  it('changes nothing when the current operator is chosen again', () => {
    const node = { operator: 'plus', values: [1, 2], extra: 1 }
    expect(switched(node, 'plus', 'plus')).toBe(node)
    const alias = { ...node, operator: '+' }
    expect(switched(alias, 'plus', 'plus')).toBe(alias)
  })

  it('repairs a broken node', () => {
    expect(switched({ operator: 'plsu', values: [1, 2] }, 'plus', null)).toEqual({
      operator: 'plus',
      values: [1, 2],
    })
    expect(switched({ operator: 'plus', fragment: 'x', values: [1] }, 'plus', null)).toEqual({
      operator: 'plus',
      values: [1],
    })
  })

  it('switches to literal, which fig-tree does not register', () => {
    expect(switched({ operator: 'plus', values: [1], fallback: 0 }, 'literal', 'plus')).toEqual({
      operator: 'literal',
      fallback: 0,
    })
  })
})
