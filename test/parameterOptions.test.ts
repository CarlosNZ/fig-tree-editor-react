import { FigTree, coreOperators, httpOperators } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { classify, rowAt } from '../src/classify'
import { buildDisplayData } from '../src/displayData'
import { addableKeys, getNewKeyValue, type AddContext } from '../src/parameterOptions'
import { type Path } from '../src/paths'
import { registry } from './fixtures'

const context: AddContext = {
  operators: registry.operators,
  displayData: buildDisplayData(registry),
  useCache: undefined,
}

const kindAt = (expression: unknown, path: Path = [], from = registry) =>
  rowAt(classify(expression, from), path)?.kind

const keysOf = (expression: Record<string, unknown>) => {
  const keys = addableKeys(expression, kindAt(expression), context)
  return (
    keys && {
      parameters: keys.parameters.map(({ key }) => key),
      modifiers: keys.modifiers.map(({ key }) => key),
    }
  )
}

const MODIFIERS = ['//', 'fallback', 'useCache', 'vars']

describe('addableKeys', () => {
  it("offers a full operator node's absent parameters, then its absent modifiers", () => {
    expect(keysOf({ operator: 'round', value: 3.14, fallback: null })).toEqual({
      parameters: ['decimals'],
      modifiers: ['//', 'useCache', 'vars'],
    })
  })

  it('lists missing required parameters first, marked required', () => {
    const node = { operator: 'if', condition: true, thn: 'x' }
    const keys = addableKeys(node, kindAt(node), context)!
    expect(keys.parameters.map(({ key, required }) => [key, required])).toEqual([
      ['then', true],
      ['else', false],
    ])
  })

  it("lists the rest in fill-in's key order, with each declaration's description", () => {
    const node = { operator: 'map', input: [1], each: '$element' }
    const keys = addableKeys(node, kindAt(node), context)!
    expect(keys.parameters.map(({ key }) => key)).toEqual(['as', 'nullInputDefault'])
    const map = registry.operators.find(({ name }) => name === 'map')!
    expect(keys.parameters[0].description).toBe(map.parameters.as.description)
  })

  it('offers a shorthand node its modifiers only', () => {
    expect(keysOf({ $plus: [1, 2], '//': 'Sum' })).toEqual({
      parameters: [],
      modifiers: ['fallback', 'useCache', 'vars'],
    })
    expect(keysOf({ $round: { value: 1 } })).toEqual({ parameters: [], modifiers: MODIFIERS })
  })

  it('offers a full fragment call `parameters`, and no `useCache`', () => {
    expect(keysOf({ fragment: 'greet' })).toEqual({
      parameters: ['parameters'],
      modifiers: ['//', 'fallback', 'vars'],
    })
    expect(keysOf({ fragment: 'greet', parameters: { name: 'Ann' } })).toEqual({
      parameters: [],
      modifiers: ['//', 'fallback', 'vars'],
    })
  })

  it('offers a `literal` a comment only', () => {
    expect(keysOf({ operator: 'literal', value: 1 })).toEqual({ parameters: [], modifiers: ['//'] })
    expect(keysOf({ $literal: 1 })).toEqual({ parameters: [], modifiers: ['//'] })
  })

  it('offers a broken node its modifiers only', () => {
    expect(keysOf({ operator: 'plsu', values: [1] })).toEqual({
      parameters: [],
      modifiers: MODIFIERS,
    })
    expect(keysOf({ operator: 'plus', fragment: 'greet' })?.parameters).toEqual([])
    expect(keysOf({ fragment: 'nope' })?.parameters).toEqual([])
  })

  it('leaves every other object to a free-typed key', () => {
    expect(keysOf({ title: 'Hello' })).toBeNull()
    const vars = { $plus: [1], vars: { a: 1 } }
    expect(addableKeys(vars.vars, kindAt(vars, ['vars']), context)).toBeNull()
  })
})

describe('getNewKeyValue', () => {
  const start = (expression: unknown, key: string, from = context) =>
    getNewKeyValue(key, kindAt(expression), from)

  it('starts a declared parameter by the starting-value rule', () => {
    expect(start({ operator: 'round', value: 3.14 }, 'decimals')).toBe(2)
    expect(start({ operator: 'regex', value: 'a', pattern: 'a' }, 'mode')).toBe('extract')
  })

  it('starts each modifier by its own rule', () => {
    const node = { operator: 'plus', values: [1] }
    expect(start(node, '//')).toBe('Comment...')
    expect(start(node, 'fallback')).toBeNull()
    expect(start(node, 'useCache')).toBe(true)
    expect(start(node, 'vars')).toEqual({})
    expect(start({ fragment: 'greet' }, 'parameters')).toEqual({})
  })

  it('starts `useCache` as the opposite of its effective setting', () => {
    const http = { operator: 'http', url: 'https://example.com' }
    expect(start(http, 'useCache')).toBe(false) // cached by definition
    const instance = (options: ConstructorParameters<typeof FigTree>[0]) => {
      const figTree = new FigTree({ operators: [coreOperators, httpOperators()], ...options })
      const from = { operators: figTree.getOperators(), fragments: [] }
      return {
        from,
        context: {
          operators: from.operators,
          displayData: buildDisplayData(from),
          useCache: figTree.getOptions().useCache,
        },
      }
    }
    const blanket = instance({ useCache: false })
    expect(getNewKeyValue('useCache', kindAt(http, [], blanket.from), blanket.context)).toBe(true)
    const perOperator = instance({
      useCache: false,
      operatorDefaults: { http: { useCache: true } },
    })
    expect(
      getNewKeyValue('useCache', kindAt(http, [], perOperator.from), perOperator.context)
    ).toBe(false)
  })

  it('starts a free-typed key as anything', () => {
    expect(start({ title: 'Hello' }, 'subtitle')).toBe('Replace me')
    const vars = { $plus: [1], vars: { a: 1 } }
    expect(getNewKeyValue('b', kindAt(vars, ['vars']), context)).toBe('Replace me')
  })
})
