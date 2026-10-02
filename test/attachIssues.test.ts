import { toPathString } from 'json-edit-react'
import { describe, expect, it } from 'vitest'
import {
  attachIssues,
  brokenIssue,
  flaggedIssues,
  issuesAt,
  issuesBeneath,
  rollUpIssues,
} from '../src/attachIssues'
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

describe("a row's flag", () => {
  const issue = (severity: string, code: string, path: (string | number)[]) =>
    ({ severity, code, message: code, path }) as never

  it('shows errors, then warnings, each in order, and no hints', () => {
    const expression = { values: [1] }
    const index = attachIssues(
      [
        issue('warning', 'w1', ['values']),
        issue('hint', 'h1', ['values']),
        issue('error', 'e1', ['values']),
        issue('warning', 'w2', ['values']),
        issue('error', 'e2', ['values']),
      ],
      classify(expression, registry)
    )
    expect(flaggedIssues(index, ['values']).map(({ code }) => code)).toEqual([
      'e1',
      'e2',
      'w1',
      'w2',
    ])
  })

  it("leaves out a hint beside fig-tree's warnings", () => {
    const expression = { greeting: { $buildString: ['Hi %1 %3', '$data.first', '$data.last'] } }
    const index = attachIssues(figTree.validate(expression).issues, classify(expression, registry))
    const row = ['greeting', '$buildString', 0]
    expect(issuesAt(index, row).map(({ severity }) => severity)).toEqual([
      'warning',
      'warning',
      'hint',
    ])
    expect(flaggedIssues(index, row).map(({ code }) => code)).toEqual([
      'unbound-token',
      'unused-substitution',
    ])
  })
})

describe('the roll-up a collapsed row carries', () => {
  const rolledUp = (expression: unknown, path: (string | number)[]) =>
    issuesBeneath(
      rollUpIssues(figTree.validate(expression).issues, classify(expression, registry)),
      path
    )

  it("counts a row's own issues and those beneath it", () => {
    const expression = {
      age: { operator: 'if', condition: '$data.isAdult', thn: 'Adult', else: 'Child' },
    }
    expect(rolledUp(expression, [])).toEqual({ errors: 2, warnings: 0 })
    expect(rolledUp(expression, ['age'])).toEqual({ errors: 2, warnings: 0 })
    expect(rolledUp(expression, ['age', 'thn'])).toEqual({ errors: 1, warnings: 0 })
    expect(rolledUp(expression, ['age', 'else'])).toEqual({ errors: 0, warnings: 0 })
  })

  it('counts warnings apart, and no hints', () => {
    const expression = { greeting: { $buildString: ['Hi %1 %3', '$data.first', '$data.last'] } }
    expect(rolledUp(expression, ['greeting'])).toEqual({ errors: 0, warnings: 2 })
  })

  it('counts an issue by the row it shows on', () => {
    // `missing-required` on a named payload's row shows on its node
    const expression = { x: { $if: { condition: true } } }
    expect(rolledUp(expression, ['x'])).toEqual({ errors: 1, warnings: 0 })
    expect(rolledUp(expression, ['x', '$if'])).toEqual({ errors: 0, warnings: 0 })
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
    expect(brokenAt({ fragment: 'greet', parameters: { name: 'Ada' }, noCache: false })).toBe(
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
