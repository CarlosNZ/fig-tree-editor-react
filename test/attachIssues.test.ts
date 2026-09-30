import { toPathString } from 'json-edit-react'
import { describe, expect, it } from 'vitest'
import { attachIssues, brokenIssue, issuesAt } from '../src/attachIssues'
import { classify } from '../src/classify'
import { figTree, registry } from './fixtures'

// Each drawn row's issues, as [row, codes]
const attached = (expression: unknown) =>
  [...attachIssues(figTree.validate(expression).issues, classify(expression, registry))].map(
    ([row, issues]) => [row, issues.map(({ code }) => code)]
  )

describe('attaching issues to rows', () => {
  it('puts an issue on the row at its path', () => {
    expect(attached({ operator: 'plus', values: [1], extra: 2 })).toEqual([
      ['extra', ['unknown-node-key']],
    ])
    expect(attached({ total: { operator: 'if', condition: true } })).toEqual([
      ['total', ['missing-required']],
    ])
  })

  it("puts an issue on a filtered row's node", () => {
    const expression = { operator: 'plus', values: [1] }
    const classification = classify(expression, registry)
    const issue = { severity: 'error', code: 'malformed-node', message: 'm', path: ['operator'] }
    expect([...attachIssues([issue] as never, classification).keys()]).toEqual([''])
  })

  it("puts an issue on a flattened payload's row on its node", () => {
    const expression = { $if: { condition: true, then: 1 } }
    const classification = classify(expression, registry)
    const issue = { severity: 'error', code: 'malformed-node', message: 'm', path: ['$if'] }
    expect([...attachIssues([issue] as never, classification).keys()]).toEqual([''])
    // The payload's own rows are drawn
    expect(attached({ $if: { condition: true, thn: 1 } })).toEqual([
      [toPathString(['$if', 'thn']), ['unknown-node-key']],
      ['', ['missing-required']],
    ])
  })

  it('finds no issues at a row without any', () => {
    const index = attachIssues([], classify({ operator: 'plus', values: [1] }, registry))
    expect(issuesAt(index, [])).toEqual([])
  })
})

describe('a broken node', () => {
  const brokenAt = (expression: unknown, path: (string | number)[] = []) => {
    const classification = classify(expression, registry)
    const index = attachIssues(figTree.validate(expression).issues, classification)
    return brokenIssue(index, classification, path, expression)?.code
  }

  it('is one that is malformed, or names nothing registered', () => {
    expect(brokenAt({ operator: 'flibble' })).toBe('unknown-operator')
    expect(brokenAt({ operator: 42 })).toBe('malformed-node')
    expect(brokenAt({ operator: 'plus', fragment: 'x', values: [1] })).toBe('malformed-node')
  })

  it('is one malformed on one of its own keys', () => {
    expect(brokenAt({ $plus: [1], extra: 2 })).toBe('malformed-node')
    expect(brokenAt({ $plus: 1, $minus: 2 })).toBe('malformed-node')
    expect(brokenAt({ $greet: '$data.x' })).toBe('malformed-node')
    expect(brokenAt({ $greet: { name: 'Ada' }, useCache: true })).toBe('malformed-node')
    expect(brokenAt({ operator: 'plus', values: [1], parameters: {} })).toBe('malformed-node')
    expect(brokenAt({ fragment: 'greet', parameters: { name: 'Ada' }, useCache: true })).toBe(
      'malformed-node'
    )
  })

  it("is not one whose parameter holds a broken node, which is that node's", () => {
    const expression = { operator: 'if', condition: { operator: 42 }, then: 1 }
    expect(brokenAt(expression)).toBeUndefined()
    expect(brokenAt(expression, ['condition'])).toBe('malformed-node')
  })

  it('is not one that is only missing something, or holds an unknown key', () => {
    expect(brokenAt({ operator: 'if', condition: true })).toBeUndefined()
    expect(brokenAt({ operator: 'plus', values: [1], extra: 2 })).toBeUndefined()
    expect(brokenAt({ $if: ['$data.x'] })).toBeUndefined()
    expect(brokenAt({ $plus: { values: [1], fallback: 0 } })).toBeUndefined()
  })
})
