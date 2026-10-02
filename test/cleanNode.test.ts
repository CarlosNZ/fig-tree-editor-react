import { describe, expect, it } from 'vitest'
import { cleanNode } from '../src/cleanNode'
import { registry } from './fixtures'

const operator = (name: string) => ({
  kind: 'operator' as const,
  operator: registry.operators.find((info) => info.name === name)!,
})
const fragment = (name: string) => ({
  kind: 'fragment' as const,
  fragment: registry.fragments.find((info) => info.name === name)!,
})

describe('cleanNode', () => {
  it("removes what the node's operator doesn't declare, keeping the modifiers", () => {
    const switched = {
      '//': 'why',
      operator: 'upper',
      value: 'x',
      decimals: 2,
      thn: 1,
      fallback: null,
      noCache: true,
      vars: { a: 1 },
    }
    expect(cleanNode(switched, operator('upper'))).toEqual({
      '//': 'why',
      operator: 'upper',
      value: 'x',
      fallback: null,
      noCache: true,
      vars: { a: 1 },
    })
  })

  it('works on the node alone, not on the nodes beneath it', () => {
    const inner = { operator: 'upper', value: 'y', extra: 2 }
    const cleaned = cleanNode({ operator: 'upper', value: inner, extra: 1 }, operator('upper'))
    expect(cleaned).toEqual({ operator: 'upper', value: inner })
    expect((cleaned as { value: unknown }).value).toBe(inner)
  })

  it("removes a fragment call's undeclared arguments, keeping the modifiers", () => {
    expect(
      cleanNode(
        { fragment: 'greet', parameters: { name: 'Ada', extra: 1 }, noCache: true, thn: 1 },
        fragment('greet')
      )
    ).toEqual({ fragment: 'greet', parameters: { name: 'Ada' }, noCache: true })
  })

  it('removes a parameters map that cleaning empties, and keeps one already empty', () => {
    expect(
      cleanNode({ fragment: 'greet', parameters: { extra: 1 }, fallback: 'x' }, fragment('greet'))
    ).toEqual({ fragment: 'greet', fallback: 'x' })
    const empty = { fragment: 'greet', parameters: {} }
    expect(cleanNode(empty, fragment('greet'))).toBe(empty)
  })

  it("leaves a fragment call's dynamic arguments as they are", () => {
    const call = { fragment: 'greet', parameters: '$data.form' }
    expect(cleanNode(call, fragment('greet'))).toBe(call)
  })

  it('returns the same node where nothing goes', () => {
    const node = { operator: 'upper', value: 'x' }
    expect(cleanNode(node, operator('upper'))).toBe(node)
  })
})
