import { describe, expect, it } from 'vitest'
import { getNodeFor, nodeConversion, type ReferenceNames } from '../src/conversions'
import { figTree } from './fixtures'

const convert = (node: unknown, referenceNames: ReferenceNames = 'canonical') =>
  nodeConversion(node, figTree, referenceNames)

describe('the conversion button', () => {
  it('steps an operator node from full, to named, to positional, and back to full', () => {
    const full = { operator: 'if', condition: '$data.ok', then: 'Yes', else: 'No' }
    const named = { $if: { condition: '$data.ok', then: 'Yes', else: 'No' } }
    const positional = { $if: ['$data.ok', 'Yes', 'No'] }
    expect(convert(full)).toEqual({ label: 'To shorthand', result: named })
    expect(convert(named)).toEqual({ label: 'To positional', result: positional })
    expect(convert(positional)).toEqual({ label: 'To full', result: full })
  })

  it('goes from named back to full where the node has no positional form', () => {
    expect(convert({ $if: { condition: true, else: 'No' } })).toEqual({
      label: 'To full',
      result: { operator: 'if', condition: true, else: 'No' },
    })
    expect(convert({ $greet: { name: 'Ada' } })).toEqual({
      label: 'To full',
      result: { fragment: 'greet', parameters: { name: 'Ada' } },
    })
  })

  it('takes a single value to full', () => {
    expect(convert({ $not: true })).toEqual({
      label: 'To full',
      result: { operator: 'not', value: true },
    })
  })

  it('keeps an operator written by its alias', () => {
    expect(convert({ operator: '+', values: [1, 2] })?.result).toEqual({ '$+': { values: [1, 2] } })
    expect(convert({ '$+': [1, 2] })?.result).toEqual({ operator: '+', values: [1, 2] })
  })

  it('takes a fragment call to shorthand, but not one whose arguments are a reference', () => {
    expect(convert({ fragment: 'greet', parameters: { name: 'Ada' } })).toEqual({
      label: 'To shorthand',
      result: { $greet: { name: 'Ada' } },
    })
    expect(convert({ fragment: 'greet', parameters: '$data.form' })).toBeNull()
  })

  it('takes a dynamic fragment shorthand back to full', () => {
    const node = { $buildObject: [{ key: 'name', value: 'Ada' }] }
    expect(convert({ $greet: node })).toEqual({
      label: 'To full',
      result: {
        fragment: 'greet',
        parameters: { operator: 'buildObject', entries: [{ key: 'name', value: 'Ada' }] },
      },
    })
  })

  describe('on `get` nodes', () => {
    it('turns a `get` that can be a reference into one, and says so', () => {
      expect(convert({ operator: 'get', path: 'user.name' })).toEqual({
        label: 'To reference',
        result: '$data.user.name',
      })
      expect(convert({ $get: { path: 'user.name' } })).toEqual({
        label: 'To reference',
        result: '$data.user.name',
      })
    })

    it('steps a `get` that has no reference form through the forms', () => {
      expect(convert({ operator: 'get', path: 'x', default: 0 })).toEqual({
        label: 'To shorthand',
        result: { $get: { path: 'x', default: 0 } },
      })
    })

    it('turns the `get` nodes beneath into references', () => {
      expect(convert({ operator: 'plus', values: [{ operator: 'get', path: 'x' }, 1] })).toEqual({
        label: 'To shorthand',
        result: { $plus: { values: ['$data.x', 1] } },
      })
    })
  })

  it("spells every reference in the subtree by `referenceNames`, the author's own included", () => {
    expect(convert({ operator: 'not', value: '$d.x' })?.result).toEqual({
      $not: { value: '$data.x' },
    })
    expect(convert({ operator: 'not', value: '$data.x' }, 'alias')?.result).toEqual({
      $not: { value: '$d.x' },
    })
    expect(convert({ operator: 'get', path: 'x' }, 'alias')?.result).toBe('$d.x')
  })

  it('offers nothing where a node beneath is broken, or the value is no node', () => {
    expect(convert({ operator: 'plus', values: [{ operator: 'flibble' }] })).toBeNull()
    expect(convert({ operator: 'plus', values: [{ $plus: [1], extra: 2 }] })).toBeNull()
    expect(convert({ a: 1 })).toBeNull()
    expect(convert('$data.x')).toBeNull()
  })
})

describe("a reference's `get` node", () => {
  it('reads the path, and the source where the reference names one', () => {
    expect(getNodeFor('$data.user.name', 'canonical')).toEqual({
      operator: 'get',
      path: 'user.name',
    })
    expect(getNodeFor('$v.row.a', 'canonical')).toEqual({
      operator: 'get',
      path: 'a',
      from: '$vars.row',
    })
    expect(getNodeFor('$vars.row.a', 'alias')).toEqual({
      operator: 'get',
      path: 'a',
      from: '$v.row',
    })
  })

  it('is none for `$index`, or a name an `as` gives', () => {
    expect(getNodeFor('$index', 'canonical')).toBeNull()
    expect(getNodeFor('$item.price', 'canonical')).toBeNull()
  })
})
