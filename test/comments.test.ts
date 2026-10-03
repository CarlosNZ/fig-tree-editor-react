import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { settleCommentLines } from '../src/comments'
import { figTree } from './fixtures'

const registry = { operators: figTree.getOperators(), fragments: figTree.getFragments() }

const settle = (previous: Record<string, unknown>, next: Record<string, unknown>) =>
  settleCommentLines(previous, next, classify(previous, registry))

describe('settleCommentLines', () => {
  const previous = {
    $plus: [{ '//': ['One', 'Two'], $abs: -1 }, { $abs: -2 }],
  }

  it('settles a comment a write leaves a line short of two, in place', () => {
    const next = { $plus: [{ '//': ['Two'], $abs: -1 }, previous.$plus[1]] }
    const settled = settle(previous, next) as typeof previous
    expect(settled).toEqual({ $plus: [{ '//': 'Two', $abs: -1 }, { $abs: -2 }] })
    // What the write left unchanged is the same object
    expect(settled.$plus[1]).toBe(previous.$plus[1])
  })

  it('returns a write that shortens no comment as it is', () => {
    const next = { $plus: [previous.$plus[0], { $abs: -3 }] }
    expect(settle(previous, next)).toBe(next)
    // Nor one that adds a line, or replaces the comment
    const added = { $plus: [{ '//': ['One', 'Two', 'Three'], $abs: -1 }, previous.$plus[1]] }
    expect(settle(previous, added)).toBe(added)
    const replaced = { $plus: [{ '//': ['One'], $abs: -1 }, previous.$plus[1]] }
    expect(settle({ $plus: [{ '//': 'One', $abs: -1 }, { $abs: -2 }] }, replaced)).toBe(replaced)
  })

  it('leaves a `//` in plain data that is not a comment', () => {
    const quoted = { operator: 'literal', value: { '//': ['One', 'Two'] } }
    const next = { operator: 'literal', value: { '//': ['One'] } }
    expect(settle(quoted, next)).toBe(next)
  })
})
