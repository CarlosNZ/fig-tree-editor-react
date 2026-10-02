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
      noCache: true,
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

  it('quotes the node on a switch to literal, its comment and modifiers included', () => {
    const node = { '//': 'why', operator: 'plus', values: [1], fallback: 0 }
    expect(switched(node, 'literal', 'plus')).toEqual({ operator: 'literal', value: node })
    // A broken node too, which may be data read as one
    const data = { operator: 'admin', name: 'Ada' }
    expect(switched(data, 'literal', null)).toEqual({ operator: 'literal', value: data })
  })

  it('switches a new node to literal as to any operator, less its value', () => {
    const node = { operator: 'upper', value: 'x', fallback: 0 }
    expect(switchOperator(node, 'literal', 'upper', operators, { quote: false })).toEqual({
      operator: 'literal',
      fallback: 0,
    })
  })

  it('switches from literal as from any operator', () => {
    expect(switched({ operator: 'literal', value: 3.5 }, 'round', 'literal')).toEqual({
      operator: 'round',
      value: 3.5,
    })
    expect(switched({ operator: 'literal', value: [1] }, 'plus', 'literal')).toEqual({
      operator: 'plus',
    })
    const literal = { operator: 'literal', value: 1 }
    expect(switched(literal, 'literal', 'literal')).toBe(literal)
  })
})
