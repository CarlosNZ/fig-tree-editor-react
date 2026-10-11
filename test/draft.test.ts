import { describe, expect, it } from 'vitest'
import { FigTree, coreOperators } from 'fig-tree-evaluator'
import { declarationIssues, draftName } from '../src/draft'
import { figTree } from './fixtures'

describe('draftName', () => {
  it('is a name nothing registered claims', () => {
    const plain = new FigTree({ operators: [coreOperators] })
    expect(draftName(plain)).toBe('fragmentDraft')
    const claimed = new FigTree({
      operators: [coreOperators],
      fragments: {
        fragmentDraft: { expression: 1 },
        fragmentDraft2: { expression: 2 },
      },
    })
    expect(draftName(claimed)).toBe('fragmentDraft3')
  })
})

describe('declarationIssues', () => {
  it('is empty for a definition that registers', () => {
    expect(
      declarationIssues(figTree, {
        expression: { $plus: ['$params.x', 1] },
        parameters: { x: { type: 'number' } },
      })
    ).toEqual([])
  })

  it("gives registration's issues outside the body, at their paths in the definition", () => {
    const issues = declarationIssues(figTree, {
      expression: { $plus: ['$params.x', '$params.undeclared'] },
      parameters: {
        x: { type: 'number', required: true, default: 1 },
        y: { type: 'number', default: 'one' },
      },
    })
    expect(issues.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: 'invalid-definition', path: ['parameters', 'x', 'default'] },
      { code: 'type-check', path: ['parameters', 'y', 'default'] },
    ])
  })

  it("leaves the host's instance as it was", () => {
    declarationIssues(figTree, { expression: 1 })
    expect(figTree.getFragments().map(({ name }) => name)).not.toContain('fragmentDraft')
  })
})
