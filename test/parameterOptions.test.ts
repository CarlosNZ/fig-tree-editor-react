import { FigTree, coreOperators, httpOperators, type FragmentInfo } from 'fig-tree-evaluator'
import { operatorListings } from 'fig-tree-evaluator/catalog'
import { describe, expect, it } from 'vitest'
import { classify, rowAt } from '../src/classify'
import { buildDisplayData } from '../src/displayData'
import { addKey, addableKeys, getNewKeyValue, type AddContext } from '../src/parameterOptions'
import { valueAt, type Path } from '../src/paths'
import { registry } from './fixtures'

type Registry = typeof registry

// The context for adding to a row of `expression`
const contextFor = (expression: unknown, from: Registry = registry): AddContext => ({
  ...from,
  classification: classify(expression, from),
  displayData: buildDisplayData(from),
})
const context = contextFor({})

const kindAt = (expression: unknown, path: Path = [], from: Registry = registry) =>
  rowAt(classify(expression, from), path)?.kind

const keysOf = (expression: Record<string, unknown>, path: Path = [], from = registry) => {
  const node = valueAt(expression, path) as Record<string, unknown>
  const keys = addableKeys(node, path, kindAt(expression, path, from), contextFor(expression, from))
  return (
    keys && {
      parameters: keys.parameters.map(({ key }) => key),
      modifiers: keys.modifiers.map(({ key }) => key),
    }
  )
}

// A node that can't cache, and one that can
const MODIFIERS = ['//', 'fallback', 'vars']
const CACHING_MODIFIERS = ['//', 'fallback', 'noCache', 'vars']

// Fragments as `getFragments()` reports them, for the order of their
// arguments and a name shared with a modifier
const fragmentInfo = (name: string, parameters: FragmentInfo['parameters']): FragmentInfo => ({
  name,
  parameters,
  returns: 'any',
  warnings: [],
  dependencies: { data: [], fragments: [] } as unknown as FragmentInfo['dependencies'],
  caches: false,
})
const shout = fragmentInfo('shout', {
  loud: { type: 'boolean', required: false },
  text: { type: 'string', required: true },
})
const odd = fragmentInfo('odd', { fallback: { type: 'string', required: true } })

describe('addableKeys', () => {
  it("offers a full operator node's absent parameters, then its absent modifiers", () => {
    expect(keysOf({ operator: 'round', value: 3.14, fallback: null })).toEqual({
      parameters: ['decimals'],
      modifiers: ['//', 'vars'],
    })
  })

  describe('noCache', () => {
    const http = { operator: 'http', url: 'https://example.com' }

    it('is offered where the node or something beneath it caches', () => {
      expect(keysOf(http)?.modifiers).toEqual(CACHING_MODIFIERS)
      expect(keysOf({ $buildString: ['%1', http] })?.modifiers).toEqual(CACHING_MODIFIERS)
      expect(keysOf({ $upper: { $plus: ['a', 'b'] } })?.modifiers).toEqual(MODIFIERS)
    })

    it('is offered on a call to a fragment whose body caches', () => {
      expect(keysOf({ fragment: 'getFlag' })?.modifiers).toEqual(CACHING_MODIFIERS)
      expect(keysOf({ $getFlag: {} })?.modifiers).toEqual(CACHING_MODIFIERS)
      expect(keysOf({ fragment: 'greet', parameters: { name: 'Ann' } })?.modifiers).toEqual(
        MODIFIERS
      )
      // A body that doesn't cache, given an argument that does
      expect(keysOf({ fragment: 'greet', parameters: { name: http } })?.modifiers).toEqual(
        CACHING_MODIFIERS
      )
    })

    it('is not offered beneath a node that has it already', () => {
      const above = { $buildString: ['%1', http], noCache: true }
      expect(keysOf(above, ['$buildString', 1])?.modifiers).toEqual(MODIFIERS)
    })

    it('is not offered on an operator the host turned off', () => {
      const figTree = new FigTree({
        operators: [coreOperators, httpOperators()],
        operatorDefaults: { http: { noCache: true } },
      })
      const from = { operators: figTree.getOperators(), fragments: [] }
      expect(keysOf(http, [], from)?.modifiers).toEqual(MODIFIERS)
    })
  })

  it('lists missing required parameters first, marked required', () => {
    const node = { operator: 'if', condition: true, thn: 'x' }
    const keys = addableKeys(node, [], kindAt(node), contextFor(node))!
    expect(keys.parameters.map(({ key, required }) => [key, required])).toEqual([
      ['then', true],
      ['else', false],
    ])
  })

  it("lists the rest in fill-in's key order, with each parameter's description", () => {
    const node = { operator: 'map', input: [1], each: '$element' }
    const keys = addableKeys(node, [], kindAt(node), contextFor(node))!
    expect(keys.parameters.map(({ key }) => key)).toEqual(['as', 'nullInputDefault'])
    expect(keys.parameters[0].description).toBe(operatorListings.map.parameterDescriptions!.as)
  })

  it('offers a shorthand node its modifiers only', () => {
    expect(keysOf({ $plus: [1, 2], fallback: 0 })).toEqual({
      parameters: [],
      modifiers: ['//', 'vars'],
    })
    expect(keysOf({ $round: { value: 1 } })).toEqual({ parameters: [], modifiers: MODIFIERS })
  })

  describe('a full fragment call', () => {
    const entries = (expression: Record<string, unknown>) =>
      addableKeys(expression, [], kindAt(expression), contextFor(expression))!.parameters.map(
        ({ key, label, required, argument }) => ({ key, label, required, argument })
      )

    it('offers its absent arguments, required first, then dynamic arguments', () => {
      expect(entries({ fragment: 'getFlag' })).toEqual([
        { key: 'country', label: undefined, required: false, argument: true },
        { key: 'parameters', label: 'Dynamic arguments', required: false, argument: undefined },
      ])
      expect(entries({ fragment: 'greet', parameters: { name: 'Ann' } })).toEqual([
        { key: 'parameters', label: 'Dynamic arguments', required: false, argument: undefined },
      ])
      const node = { fragment: 'shout' }
      const from = { ...registry, fragments: [shout] }
      expect(
        addableKeys(node, [], kindAt(node, [], from), contextFor(node, from))!.parameters.map(
          ({ key, required }) => [key, required]
        )
      ).toEqual([
        ['text', true],
        ['loud', false],
        ['parameters', false],
      ])
    })

    it('offers static arguments in place of dynamic ones', () => {
      expect(keysOf({ fragment: 'greet', parameters: '$data.form' })).toEqual({
        parameters: ['parameters'],
        modifiers: ['//', 'fallback', 'vars'],
      })
      expect(entries({ fragment: 'greet', parameters: '$data.form' })[0].label).toBe(
        'Static arguments'
      )
    })

    it('adds an argument inside parameters, creating it, and switches the kind of arguments', () => {
      const add = (node: Record<string, unknown>, index = 0) => {
        const kind = kindAt(node)
        const entry = addableKeys(node, [], kind, contextFor(node))!.parameters[index]
        return addKey(node, entry, kind, contextFor(node))
      }
      expect(add({ fragment: 'getFlag' })).toEqual({
        fragment: 'getFlag',
        parameters: { country: 'Replace me' },
      })
      expect(add({ fragment: 'getFlag', parameters: { '//': 'x' } })).toEqual({
        fragment: 'getFlag',
        parameters: { '//': 'x', country: 'Replace me' },
      })
      expect(add({ fragment: 'greet', parameters: { name: 'Ann' } })).toEqual({
        fragment: 'greet',
        parameters: '$data',
      })
      expect(add({ fragment: 'greet', parameters: '$data.form' })).toEqual({
        fragment: 'greet',
        parameters: {},
      })
    })

    it('keeps an argument apart from a modifier of the same name', () => {
      const node = { fragment: 'odd' }
      const from = { ...registry, fragments: [odd] }
      const kind = kindAt(node, [], from)
      const withContext = contextFor(node, from)
      const keys = addableKeys(node, [], kind, withContext)!
      expect(addKey(node, keys.parameters[0], kind, withContext)).toEqual({
        fragment: 'odd',
        parameters: { fallback: 'Replace me' },
      })
      expect(addKey(node, keys.modifiers[1], kind, withContext)).toEqual({
        fragment: 'odd',
        fallback: null,
      })
    })
  })

  describe('a comment already there', () => {
    const add = (node: Record<string, unknown>) => {
      const kind = kindAt(node)
      const entry = addableKeys(node, [], kind, contextFor(node))!.modifiers[0]
      return { entry, added: addKey(node, entry, kind, contextFor(node)) }
    }

    it('is offered again, adding a line at the end', () => {
      const { entry, added } = add({ '//': 'One', operator: 'abs', value: 1 })
      expect(entry).toMatchObject({ key: '//', description: 'Another line for the note' })
      expect(added).toEqual({ '//': ['One', 'Comment...'], operator: 'abs', value: 1 })
      expect(add({ '//': ['One', 'Two'], $abs: 1 }).added).toEqual({
        '//': ['One', 'Two', 'Comment...'],
        $abs: 1,
      })
      expect(add({ operator: 'literal', value: 1, '//': 'One' }).added).toEqual({
        operator: 'literal',
        value: 1,
        '//': ['One', 'Comment...'],
      })
    })

    it('is not offered again while it holds another value', () => {
      expect(keysOf({ '//': { ticket: 1 }, operator: 'abs', value: 1 })?.modifiers).toEqual([
        'fallback',
        'vars',
      ])
    })
  })

  it('offers a `literal` a comment only', () => {
    expect(keysOf({ operator: 'literal', value: 1 })).toEqual({ parameters: [], modifiers: ['//'] })
    expect(keysOf({ $literal: 1 })).toEqual({ parameters: [], modifiers: ['//'] })
  })

  it('offers a broken node its modifiers only', () => {
    // One that names nothing registered may cache, as `validate()` has it
    expect(keysOf({ operator: 'plsu', values: [1] })).toEqual({
      parameters: [],
      modifiers: CACHING_MODIFIERS,
    })
    expect(keysOf({ operator: 'plus', fragment: 'greet' })?.parameters).toEqual([])
    expect(keysOf({ fragment: 'nope' })?.parameters).toEqual([])
  })

  it('leaves every other object to a free-typed key', () => {
    expect(keysOf({ title: 'Hello' })).toBeNull()
    const vars = { $plus: [1], vars: { a: 1 } }
    expect(addableKeys(vars.vars, ['vars'], kindAt(vars, ['vars']), contextFor(vars))).toBeNull()
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
    expect(start({ operator: 'http', url: 'https://example.com' }, 'noCache')).toBe(true)
    expect(start(node, 'vars')).toEqual({})
  })

  it('starts a free-typed key as anything', () => {
    expect(start({ title: 'Hello' }, 'subtitle')).toBe('Replace me')
    const vars = { $plus: [1], vars: { a: 1 } }
    expect(getNewKeyValue('b', kindAt(vars, ['vars']), context)).toBe('Replace me')
  })
})
