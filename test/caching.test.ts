import { FigTree, coreOperators, httpOperators } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { cacheStatus, takesNoCache } from '../src/caching'
import { classify, rowAt } from '../src/classify'
import { type Path } from '../src/paths'
import { registry } from './fixtures'

type Registry = Pick<Parameters<typeof cacheStatus>[2], 'operators' | 'fragments'>

const contextFor = (expression: unknown, from: Registry = registry) => ({
  ...from,
  classification: classify(expression, from),
})

const statusAt = (expression: unknown, path: Path = [], from: Registry = registry) => {
  const context = contextFor(expression, from)
  return cacheStatus(path, rowAt(context.classification, path)?.kind, context)
}

const http = { operator: 'http', url: 'https://example.com' }

describe('cacheStatus', () => {
  it('is active on a node that caches, with no noCache on it or above it', () => {
    expect(statusAt(http)).toBe('active')
    expect(statusAt({ $http: 'https://example.com' })).toBe('active')
    expect(statusAt({ fragment: 'getFlag' })).toBe('active')
    expect(statusAt({ $getFlag: {} })).toBe('active')
  })

  it('is disabled by a noCache on the node, or on any node holding it', () => {
    expect(statusAt({ ...http, noCache: true })).toBe('disabled')
    expect(statusAt({ $getFlag: {}, noCache: true })).toBe('disabled')
    const deep = { $upper: { $buildString: ['%1', http] }, noCache: true }
    expect(statusAt(deep, ['$upper', '$buildString', 1])).toBe('disabled')
    const inVars = { $upper: '$vars.page', vars: { page: http }, noCache: true }
    expect(statusAt(inVars, ['vars', 'page'])).toBe('disabled')
    // A sibling's noCache covers only what it holds
    expect(statusAt({ a: { $plus: [1], noCache: true }, b: http }, ['b'])).toBe('active')
  })

  it("is disabled on an operator the host's noCache turned off", () => {
    const figTree = new FigTree({
      operators: [coreOperators, httpOperators()],
      operatorDefaults: { http: { noCache: true } },
    })
    const from = { operators: figTree.getOperators(), fragments: [] }
    expect(statusAt(http, [], from)).toBe('disabled')
  })

  it('is left out on a node that never caches', () => {
    expect(statusAt({ $plus: [1, 2] })).toBeUndefined()
    expect(statusAt({ fragment: 'greet', parameters: { name: 'Ada' } })).toBeUndefined()
    expect(statusAt({ $buildString: ['%1', http] })).toBeUndefined()
    expect(statusAt({ operator: 'plsu', values: [1] })).toBeUndefined()
    expect(statusAt({ a: 1 })).toBeUndefined()
  })
})

describe('takesNoCache', () => {
  const takes = (expression: unknown, path: Path = []) => takesNoCache(path, contextFor(expression))

  it('holds where the node or something inside it caches', () => {
    expect(takes(http)).toBe(true)
    expect(takes({ $buildString: ['%1', http] })).toBe(true)
    expect(takes({ fragment: 'greet', parameters: { name: http } })).toBe(true)
    expect(takes({ $plus: [1, 2] })).toBe(false)
  })

  it('fails beneath a node that has noCache already', () => {
    expect(takes({ $buildString: ['%1', http], noCache: true }, ['$buildString', 1])).toBe(false)
  })
})
