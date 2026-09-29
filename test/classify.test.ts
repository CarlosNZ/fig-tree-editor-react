import { inspect } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { describe, expect, it } from 'vitest'
import { classify, rowAt, type Classification } from '../src/classify'
import { type Path } from '../src/paths'
import { demoExpressions, figTree, registry } from './fixtures'

const classified = (expression: unknown) => classify(expression, registry)
const row = (expression: unknown, path: Path) => rowAt(classified(expression), path)
const kind = (expression: unknown, path: Path = []) => row(expression, path)?.kind

describe('the classification walk', () => {
  describe('full operator nodes', () => {
    const node = { operator: 'plus', values: [1, 2] }

    it('marks the node and filters its operator row', () => {
      expect(kind(node)).toEqual({ kind: 'operator', form: 'full', name: 'plus', operator: 'plus' })
      expect(row(node, ['operator'])).toEqual({ filtered: true })
    })

    it('keeps an alias as written, with its canonical name', () => {
      expect(kind({ operator: '+', values: [1, 2] })).toMatchObject({ name: '+', operator: 'plus' })
    })

    it("walks an unknown operator's parameters as undeclared", () => {
      const broken = { operator: 'flibble', values: [{ $plus: [1] }] }
      expect(kind(broken)).toMatchObject({ kind: 'operator', name: 'flibble', operator: null })
      expect(row(broken, ['values'])?.slot).toMatchObject({ role: 'parameter', admits: 'any' })
      expect(kind(broken, ['values', 0])).toMatchObject({ kind: 'operator', form: 'shorthand' })
    })

    it('marks a malformed node by its keys, without walking it', () => {
      const both = { operator: 'plus', fragment: 'greet', values: ['$data.x'] }
      expect(kind(both)).toMatchObject({ kind: 'operator', operator: 'plus' })
      expect(kind(both)).toHaveProperty('malformed')
      expect(row(both, ['values'])).toBeUndefined()
      expect(kind({ $plus: [1], $not: true })).toMatchObject({
        kind: 'operator',
        form: 'shorthand',
        name: 'plus',
      })
    })
  })

  describe('fragment calls', () => {
    it('flattens a static call’s arguments', () => {
      const call = { fragment: 'greet', parameters: { name: 'Ada' } }
      expect(kind(call)).toEqual({
        kind: 'fragment',
        form: 'full',
        name: 'greet',
        registered: true,
        arguments: 'static',
      })
      expect(row(call, ['fragment'])).toEqual({ filtered: true })
      expect(row(call, ['parameters'])).toEqual({ payload: 'flattened' })
      expect(row(call, ['parameters', 'name'])?.slot).toMatchObject({
        role: 'parameter',
        parameter: 'name',
        admits: 'string',
      })
    })

    it('has no arguments without `parameters`', () => {
      expect(kind({ fragment: 'greet' })).toMatchObject({ arguments: 'none' })
    })

    it('computes its arguments from a reference or a node', () => {
      const byReference = { fragment: 'greet', parameters: '$data.form' }
      expect(kind(byReference)).toMatchObject({ arguments: 'dynamic' })
      expect(row(byReference, ['parameters'])).toMatchObject({
        kind: { kind: 'reference', namespace: 'data' },
        slot: { role: 'arguments', admits: 'object' },
      })
      expect(row(byReference, ['parameters'])).not.toHaveProperty('payload')
      const byNode = { fragment: 'greet', parameters: { $buildObject: [] } }
      expect(kind(byNode)).toMatchObject({ arguments: 'dynamic' })
      expect(kind(byNode, ['parameters'])).toMatchObject({ kind: 'operator', name: 'buildObject' })
    })

    it('marks an unregistered fragment', () => {
      expect(kind({ fragment: 'nope' })).toMatchObject({ kind: 'fragment', registered: false })
    })
  })

  describe('shorthand nodes', () => {
    it('flattens a named payload', () => {
      const node = { $if: { condition: '$data.ok', then: 'Yes' } }
      expect(kind(node)).toEqual({
        kind: 'operator',
        form: 'shorthand',
        name: 'if',
        operator: 'if',
      })
      expect(row(node, ['$if'])).toEqual({ payload: 'flattened' })
      expect(row(node, ['$if', 'condition'])).toMatchObject({
        kind: { kind: 'reference', namespace: 'data' },
        slot: { role: 'parameter', parameter: 'condition', ownerPath: [] },
      })
    })

    it('leaves an argument array unlabelled, with no slot of its own', () => {
      const node = { $plus: [1, 2] }
      expect(row(node, ['$plus'])).toEqual({ payload: 'unlabelled' })
      expect(row(node, ['$plus', 0])?.slot).toMatchObject({ role: 'element', parameter: 'values' })
      expect(kind({ '$+': [1, 2] })).toMatchObject({ name: '+', operator: 'plus' })
    })

    it('gives a single value the slot of the parameter it binds', () => {
      expect(row({ $not: true }, ['$not'])).toMatchObject({
        payload: 'unlabelled',
        slot: { role: 'parameter', parameter: 'value' },
      })
      expect(row({ $not: true }, ['$not'])).not.toHaveProperty('kind')
      expect(kind({ $not: '$data.x' }, ['$not'])).toMatchObject({ kind: 'reference' })
      expect(kind({ $not: { $greaterThan: ['$data.age', 18] } }, ['$not'])).toMatchObject({
        kind: 'operator',
        name: 'greaterThan',
      })
    })

    it('reads modifiers beside the payload', () => {
      const node = { $http: 'https://example.com', fallback: null }
      expect(row(node, ['fallback'])?.slot).toMatchObject({
        role: 'modifier',
        parameter: 'fallback',
      })
    })

    it('flattens a static fragment payload, and computes a dynamic one', () => {
      expect(kind({ $greet: { name: 'Ada' } })).toMatchObject({
        kind: 'fragment',
        form: 'shorthand',
        arguments: 'static',
      })
      expect(row({ $greet: {} }, ['$greet'])).toEqual({ payload: 'flattened' })
      const dynamic = { $greet: { $buildObject: [] } }
      expect(kind(dynamic)).toMatchObject({ arguments: 'dynamic' })
      expect(row(dynamic, ['$greet'])).toMatchObject({
        payload: 'unlabelled',
        slot: { role: 'arguments' },
      })
      const byReference = { $greet: '$data.x' }
      expect(kind(byReference)).toMatchObject({ arguments: 'invalid' })
      expect(row(byReference, ['$greet'])).toEqual({ payload: 'unlabelled' })
    })
  })

  describe('literal', () => {
    it('quotes its content, in either form', () => {
      const full = { operator: 'literal', value: { $plus: [1] } }
      expect(kind(full)).toEqual({ kind: 'literal', form: 'full' })
      expect(row(full, ['operator'])).toEqual({ filtered: true })
      expect(row(full, ['value'])).toBeUndefined()
      expect(row(full, ['value', '$plus'])).toBeUndefined()
      const short = { $literal: { $plus: [1] } }
      expect(kind(short)).toEqual({ kind: 'literal', form: 'shorthand' })
      expect(row(short, ['$literal'])).toEqual({ payload: 'unlabelled' })
      expect(row(short, ['$literal', '$plus'])).toBeUndefined()
    })
  })

  describe('references', () => {
    it.each([
      ['$data.user.name', 'data'],
      ['$d.user.name', 'data'],
      ['$data', 'data'],
      ['$vars.country[0].name', 'vars'],
      ['$element.name', 'element'],
      ['$index', 'index'],
    ])('reads %s in the %s namespace', (reference, namespace) => {
      expect(kind(reference)).toEqual({ kind: 'reference', namespace })
    })

    it('marks a reference-shaped string that fig-tree rejects', () => {
      expect(kind('$vars')).toEqual({ kind: 'reference', namespace: 'vars', invalid: true })
    })

    it.each(['$dat.x', '$database', 'Hi {{$data.name}}', 'plain'])(
      'leaves %s a string',
      (value) => {
        expect(kind(value)).toBeUndefined()
      }
    )
  })

  describe('plain data', () => {
    it('marks a container holding a node or reference', () => {
      expect(kind({ title: '$data.name', total: { $plus: [1] } })).toEqual({ kind: 'container' })
      expect(kind(['$data.a', 1])).toEqual({ kind: 'container' })
      expect(kind({ outer: { inner: '$data.a' } })).toEqual({ kind: 'container' })
    })

    it('leaves plain data unmarked', () => {
      expect(kind({ a: 1 })).toBeUndefined()
      expect(kind({ $typo: 1 })).toBeUndefined()
    })
  })

  describe('comments and vars', () => {
    it('marks a comment and quotes its value', () => {
      const node = { '//': ['A note', '$data.x'], $plus: [1] }
      expect(kind(node, ['//'])).toEqual({ kind: 'comment' })
      expect(row(node, ['//', 1])).toBeUndefined()
      expect(kind({ '//': 'On plain data', a: 1 }, ['//'])).toEqual({ kind: 'comment' })
    })

    it("reads a vars block's keys as names", () => {
      const node = { $plus: ['$vars.n'], vars: { n: 5, operator: 'x', $plus: 1 } }
      expect(row(node, ['vars'])).toEqual({ kind: { kind: 'vars' } })
      expect(row(node, ['vars', 'operator'])?.slot).toMatchObject({ role: 'var', ownerPath: [] })
      expect(row(node, ['vars', '$plus'])).not.toHaveProperty('kind')
    })

    it('leaves a malformed block plain', () => {
      expect(row({ $plus: [1], vars: [1] }, ['vars'])).toBeUndefined()
    })

    it('reads nothing in a literal-only slot', () => {
      expect(row({ $plus: [1], useCache: '$data.x' }, ['useCache'])).not.toHaveProperty('kind')
    })
  })

  describe('scope chains', () => {
    const scopeAt = (expression: unknown, path: Path) => row(expression, path)?.scope

    it("covers a node's parameters, fallback and vars with its vars block", () => {
      const node = { $plus: ['$vars.x'], vars: { x: 1, y: '$vars.x' }, fallback: '$vars.x' }
      const scope = [{ kind: 'vars', path: ['vars'] }]
      expect(scopeAt(node, [])).toEqual([])
      expect(scopeAt(node, ['$plus', 0])).toEqual(scope)
      expect(scopeAt(node, ['vars', 'y'])).toEqual(scope)
      expect(scopeAt(node, ['fallback'])).toEqual(scope)
    })

    it('chains enclosing blocks outermost first', () => {
      const expression = {
        vars: { a: 1 },
        total: { $plus: ['$vars.a', '$vars.b'], vars: { b: 2 } },
      }
      expect(scopeAt(expression, ['total', '$plus', 1])).toEqual([
        { kind: 'vars', path: ['vars'] },
        { kind: 'vars', path: ['total', 'vars'] },
      ])
    })

    it("covers only an iterator's per-element parameter", () => {
      const node = {
        $map: {
          input: '$item',
          as: 'item',
          each: { $plus: ['$item.price', '$itemIndex', '$element'] },
        },
      }
      const iterator = { kind: 'iterator', path: [], as: 'item' }
      expect(scopeAt(node, ['$map', 'input'])).toEqual([])
      expect(kind(node, ['$map', 'input'])).toBeUndefined()
      expect(scopeAt(node, ['$map', 'each', '$plus', 0])).toEqual([iterator])
      expect(kind(node, ['$map', 'each', '$plus', 0])).toEqual({
        kind: 'reference',
        namespace: 'element',
        binding: 'item',
      })
      expect(kind(node, ['$map', 'each', '$plus', 1])).toEqual({
        kind: 'reference',
        namespace: 'index',
        binding: 'itemIndex',
      })
      expect(kind(node, ['$map', 'each', '$plus', 2])).toEqual({
        kind: 'reference',
        namespace: 'element',
      })
      expect(row(node, ['$map', 'as'])?.slot).toMatchObject({ literalOnly: true })
    })

    it('binds nested iterators’ names', () => {
      const node = {
        $map: {
          input: '$data.orders',
          as: 'order',
          each: { $map: { input: '$order.lines', as: 'line', each: ['$order.id', '$line.sku'] } },
        },
      }
      const each = ['$map', 'each', '$map', 'each']
      expect(row(node, each)?.scope).toEqual([
        { kind: 'iterator', path: [], as: 'order' },
        { kind: 'iterator', path: ['$map', 'each'], as: 'line' },
      ])
      expect(kind(node, [...each, 0])).toMatchObject({ binding: 'order' })
      expect(kind(node, [...each, 1])).toMatchObject({ binding: 'line' })
      expect(kind(node, ['$map', 'each', '$map', 'input'])).toMatchObject({ binding: 'order' })
    })
  })

  // `inspect()` is the compiler's own reading, so every operator node,
  // fragment call and reference it reports must be in the map at the same
  // path, and no others. Its report shape is outside semver, which suits a
  // test pinned to the fig-tree the editor depends on.
  describe('parity with the compiler', () => {
    const shapes = [
      { operator: 'plus', values: [1, '$data.x'] },
      { '//': 'why', operator: 'http', url: '$data.url', fallback: null, useCache: false },
      { fragment: 'greet', parameters: { name: '$data.name' } },
      { fragment: 'greet', parameters: '$data.form' },
      { fragment: 'greet', parameters: { $buildObject: [{ key: 'name', value: '$data.n' }] } },
      { $if: { condition: '$data.ok', then: 'Yes', else: { $upper: '$data.no' } } },
      { $plus: [1, 2], vars: { x: { $multiply: [2, '$vars.y'] }, y: 3 } },
      { $not: { $greaterThan: ['$data.age', 18] } },
      { $greet: { name: 'Ada' } },
      { $greet: { $buildObject: [] } },
      { operator: 'literal', value: { $plus: [1] } },
      { $literal: '$data.x' },
      { title: '$data.name', total: { $plus: ['$data.a', '$data.b'] }, vars: { z: 1 } },
      { operator: 'match', value: '$data.k', branches: { a: '$data.a', b: { $plus: [1] } } },
      { $map: { input: '$data.list', as: 'item', each: { $plus: ['$item.p', '$itemIndex'] } } },
      { $buildString: { template: 'Hi {{$data.name}}' } },
      { '//': ['A', '$data.x'], $firstOf: ['$data.a', { $get: 'b' }] },
    ]
    const cases = [
      ...shapes.map((expression) => ({ name: JSON.stringify(expression), expression })),
      ...demoExpressions,
    ]

    // Each operator node, fragment call and reference in `inspect()`'s
    // canonical form. A `{{$data.x}}` token in a template is a reference to
    // the compiler but a string in the tree, so only references whose row
    // holds exactly that text count.
    const compilerPaths = (expression: unknown) => {
      const found = new Set<string>()
      const read = (value: unknown) => {
        if (Array.isArray(value)) return value.forEach(read)
        if (typeof value !== 'object' || value === null) return
        const node = value as Record<string, unknown>
        if (typeof node.kind === 'string' && Array.isArray(node.path)) {
          const path = node.path as Path
          if (
            node.kind === 'operator' ||
            node.kind === 'fragmentCall' ||
            (node.kind === 'reference' && valueAt(expression, path) === node.authored)
          )
            found.add(toPathString(path))
        }
        // Past the fields that hold authored data rather than nodes
        if (node.kind === 'constant' || node.kind === 'invalid') return
        for (const [key, child] of Object.entries(node)) if (key !== 'shape') read(child)
      }
      read(inspect(figTree.compile(expression)).canonicalForm)
      return [...found].sort()
    }

    const editorPaths = (classification: Classification) =>
      [...classification]
        .filter(([, { kind }]) => {
          if (kind?.kind === 'operator' || kind?.kind === 'fragment') return !kind.malformed
          return kind?.kind === 'reference' && !kind.invalid
        })
        .map(([key]) => key)
        .sort()

    it.each(cases)('agrees on $name', ({ expression }) => {
      expect(figTree.validate(expression).issues.filter((i) => i.severity === 'error')).toEqual([])
      expect(editorPaths(classified(expression))).toEqual(compilerPaths(expression))
    })
  })
})

const valueAt = (value: unknown, path: Path): unknown =>
  path.reduce<unknown>((parent, key) => (parent as Record<string | number, unknown>)?.[key], value)
