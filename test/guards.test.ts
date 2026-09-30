import { type NodeData } from 'json-edit-react'
import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { canAdd, canDelete } from '../src/guards'
import { valueAt, type Path } from '../src/paths'
import { registry } from './fixtures'

const at = (expression: unknown, path: Path) => {
  const nodeData = {
    key: path.at(-1) ?? '',
    path,
    level: path.length,
    value: valueAt(expression, path),
    parentData: path.length === 0 ? null : valueAt(expression, path.slice(0, -1)),
    fullData: expression,
  } as NodeData
  const context = { classification: classify(expression, registry), ...registry }
  return { deletes: canDelete(nodeData, context), adds: canAdd(nodeData, context) }
}
const deletes = (expression: unknown, path: Path) => at(expression, path).deletes
const adds = (expression: unknown, path: Path) => at(expression, path).adds

describe('canDelete', () => {
  it.each<[string, unknown, Path]>([
    ['the root', { operator: 'plus', values: [1] }, []],
    ["a full node's required parameter", { operator: 'round', value: 1 }, ['value']],
    ["a named payload's required parameter", { $round: { value: 1 } }, ['$round', 'value']],
    [
      "a static fragment call's required argument",
      { fragment: 'greet', parameters: { name: 'Ann' } },
      ['parameters', 'name'],
    ],
    [
      "an element shape's required field",
      { operator: 'buildObject', entries: [{ key: 'a', value: 1 }] },
      ['entries', 0, 'key'],
    ],
    ['a leading position before the last', { $if: [true, 'a', 'b'] }, ['$if', 1]],
    ['a required leading position, even last', { $if: [true, 'a'] }, ['$if', 1]],
    ['a single-value payload', { $not: '$data.x' }, ['$not']],
    ['an argument list', { $plus: [1, 2] }, ['$plus']],
    ['an element at a fixed length', { operator: 'lessThan', values: [1, 2] }, ['values', 0]],
    ['a positional element at a fixed length', { $greaterThan: [1, 2] }, ['$greaterThan', 0]],
  ])('is blocked on %s', (_, expression, path) => {
    expect(deletes(expression, path)).toBe(false)
  })

  it.each<[string, unknown, Path]>([
    ['an optional parameter', { operator: 'round', value: 1, decimals: 2 }, ['decimals']],
    ['a modifier', { operator: 'round', value: 1, fallback: 0 }, ['fallback']],
    ['a comment', { '//': 'A note', operator: 'round', value: 1 }, ['//']],
    ['a var', { operator: 'round', value: '$vars.a', vars: { a: 1 } }, ['vars', 'a']],
    ['`as`', { operator: 'map', input: [1], each: '$item', as: 'item' }, ['as']],
    ['the last optional leading position', { $if: [true, 'a', 'b'] }, ['$if', 2]],
    ['an element of a rest parameter', { $plus: [1, 2] }, ['$plus', 0]],
    ['the last element of an aggregate', { operator: 'plus', values: [1] }, ['values', 0]],
    ['an element over a fixed length', { operator: 'lessThan', values: [1, 2, 3] }, ['values', 0]],
    ['plain data', { operator: 'if', condition: true, then: { a: 1 } }, ['then', 'a']],
    ["an unknown operator's parameter", { operator: 'plsu', values: [1] }, ['values']],
  ])('allows %s', (_, expression, path) => {
    expect(deletes(expression, path)).toBe(true)
  })
})

describe('canAdd', () => {
  it.each<[string, unknown, Path]>([
    ['a full operator node', { operator: 'round', value: 1 }, []],
    ['a broken full operator node', { operator: 'plsu', values: [1] }, []],
    [
      'a shorthand node with nothing left to add',
      { '//': 'x', $plus: [1], fallback: 0, useCache: true, vars: {} },
      [],
    ],
    ['a full fragment call', { fragment: 'greet' }, []],
    [
      'an array parameter at its fixed length',
      { operator: 'lessThan', values: [1, 2] },
      ['values'],
    ],
    ['an array parameter over it', { operator: 'lessThan', values: [1, 2, 3] }, ['values']],
    ['an argument list with no position left', { $round: [3.14, 2] }, ['$round']],
    ['a single-position argument list', { $not: [true] }, ['$not']],
    ['an argument list whose rest is full', { $greaterThan: [1, 2] }, ['$greaterThan']],
  ])('is blocked on %s', (_, expression, path) => {
    expect(adds(expression, path)).toBe(false)
  })

  it.each<[string, unknown, Path]>([
    ['a shorthand node with a modifier to add', { $plus: [1] }, []],
    [
      'an array parameter under its fixed length',
      { operator: 'lessThan', values: [1] },
      ['values'],
    ],
    ['an array parameter with no fixed length', { operator: 'plus', values: [1] }, ['values']],
    ['an argument list with a rest parameter', { $plus: [1, 2] }, ['$plus']],
    ['an argument list with an optional position left', { $round: [3.14] }, ['$round']],
    ['a vars block', { operator: 'round', value: 1, vars: { a: 1 } }, ['vars']],
    ['plain data', { operator: 'if', condition: true, then: { a: 1 } }, ['then']],
    ['quoted content', { operator: 'literal', value: [1, 2] }, ['value']],
    ['a flattened payload', { $round: { value: 1 } }, ['$round']],
  ])('allows %s', (_, expression, path) => {
    expect(adds(expression, path)).toBe(true)
  })
})
