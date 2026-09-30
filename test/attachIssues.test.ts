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
  const brokenAt = (expression: unknown) => {
    const index = attachIssues(figTree.validate(expression).issues, classify(expression, registry))
    return brokenIssue(issuesAt(index, []))?.code
  }

  it('is one that is malformed, or names nothing registered', () => {
    expect(brokenAt({ operator: 'flibble' })).toBe('unknown-operator')
    expect(brokenAt({ operator: 42 })).toBe('malformed-node')
    expect(brokenAt({ operator: 'plus', fragment: 'x', values: [1] })).toBe('malformed-node')
  })

  it('is not one that is only missing something, or holds an unknown key', () => {
    expect(brokenAt({ operator: 'if', condition: true })).toBeUndefined()
    expect(brokenAt({ operator: 'plus', values: [1], extra: 2 })).toBeUndefined()
  })
})
