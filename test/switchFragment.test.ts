import { FigTree } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { switchFragment } from '../src/switchFragment'

const fragments = new FigTree({
  fragments: {
    greet: {
      expression: { $plus: ['Hello ', '$params.name'] },
      parameters: { name: { type: 'string' }, title: { type: 'string', required: false } },
    },
    farewell: {
      expression: { $plus: ['Bye ', '$params.name'] },
      parameters: { name: { type: 'string' } },
    },
    today: { expression: 'Monday' },
  },
}).getFragments()

const to = (node: Record<string, unknown>, target: string, current: string | null = 'greet') =>
  switchFragment(node, target, current, fragments)

describe('switchFragment', () => {
  it('keeps the modifiers and the arguments the new fragment declares, and drops the rest', () => {
    const call = {
      '//': 'why',
      fragment: 'greet',
      parameters: { name: 'Ada', title: 'Dr' },
      fallback: 'x',
      vars: { a: 1 },
    }
    expect(to(call, 'farewell')).toEqual({
      '//': 'why',
      fragment: 'farewell',
      parameters: { name: 'Ada' },
      fallback: 'x',
      vars: { a: 1 },
    })
  })

  it('removes a map the switch empties', () => {
    expect(to({ fragment: 'greet', parameters: { name: 'Ada' } }, 'today')).toEqual({
      fragment: 'today',
    })
  })

  it('keeps dynamic arguments as they are', () => {
    expect(to({ fragment: 'greet', parameters: '$data.form' }, 'today')).toEqual({
      fragment: 'today',
      parameters: '$data.form',
    })
  })

  it('changes nothing on the current fragment, or one that is not registered', () => {
    const call = { fragment: 'greet', parameters: { name: 'Ada' } }
    expect(to(call, 'greet')).toBe(call)
    expect(to(call, 'nope')).toBe(call)
  })

  it('repairs a broken call', () => {
    expect(to({ fragment: 'greeet', parameters: { name: 'Ada', x: 1 } }, 'greet', null)).toEqual({
      fragment: 'greet',
      parameters: { name: 'Ada' },
    })
  })
})
