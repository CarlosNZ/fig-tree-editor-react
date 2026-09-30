import { type ExpectedType } from 'fig-tree-evaluator'
import { describe, expect, it } from 'vitest'
import { buildDisplayData } from '../src/displayData'
import { fillAndTidy } from '../src/fillAndTidy'
import { getStartingNode, type DefaultOperators } from '../src/getStartingNode'
import { figTree, registry } from './fixtures'

const displayData = buildDisplayData(registry)
const admits = (operator: string, parameter: string): ExpectedType =>
  registry.operators.find(({ name }) => name === operator)!.parameters[parameter].type

const start = (slot: ExpectedType, defaultOperators?: DefaultOperators) =>
  getStartingNode(slot, { operators: registry.operators, displayData, defaultOperators })

// As it's committed, completed by the fill-in step
const committed = (slot: ExpectedType, defaultOperators?: DefaultOperators) => {
  const node = start(slot, defaultOperators)
  return fillAndTidy(node, { ...registry, displayData, issues: figTree.validate(node).issues })
    .expression
}

const PLUS = { operator: 'plus', values: [1, 2, 3] }
const EQUAL = { operator: 'equal', values: ['These are equal', 'These are equal'] }
const MAP = { operator: 'map', input: [1, 2, 3], each: '$element' }

// The design's tables (topic 8, "Defaults and what the pickers offer")
describe('getStartingNode', () => {
  it.each<[string, string, unknown]>([
    ['if', 'condition', PLUS],
    ['round', 'value', PLUS],
    ['round', 'decimals', PLUS],
    ['upper', 'value', { operator: 'buildString', template: 'Hello {{$data.name}}' }],
    ['buildString', 'trim', EQUAL],
    ['map', 'input', MAP],
    ['buildString', 'substitutions', MAP],
  ])('starts a node at %s.%s from the built-in map', (operator, parameter, node) => {
    expect(committed(admits(operator, parameter))).toEqual(node)
  })

  it('applies a single value at every type', () => {
    const get = { operator: 'get', path: 'path.to.value', fallback: null }
    for (const [operator, parameter] of [
      ['if', 'condition'],
      ['round', 'value'],
      ['upper', 'value'],
      ['map', 'input'],
    ])
      expect(committed(admits(operator, parameter), get)).toEqual(get)
  })

  it('merges a partial map over the built-in one', () => {
    const defaults = {
      number: '+',
      string: { operator: 'upper', value: '$data.name' },
      array: 'round',
    }
    const at = (operator: string, parameter: string) =>
      committed(admits(operator, parameter), defaults)
    expect(at('round', 'value')).toEqual({ operator: '+', values: [1, 2, 3] })
    expect(at('round', 'decimals')).toEqual({ operator: '+', values: [1, 2, 3] })
    expect(at('upper', 'value')).toEqual({ operator: 'upper', value: '$data.name' })
    expect(at('map', 'input')).toEqual(PLUS) // `round` can't fit an array
    expect(at('if', 'condition')).toEqual(PLUS)
    expect(at('buildString', 'trim')).toEqual(EQUAL)
  })

  it('keeps the built-in entry where the map sets one to undefined', () => {
    expect(start(admits('upper', 'value'), { string: undefined })).toEqual({
      operator: 'buildString',
    })
  })

  it("gives way to the `any` entry for a name that isn't registered", () => {
    expect(start(admits('round', 'value'), { number: 'nope', any: 'round' })).toEqual({
      operator: 'round',
    })
  })

  it('gives way to the first operator the picker offers, where `any` fails too', () => {
    expect(start(admits('map', 'input'), 'round')).toEqual({ operator: 'if' })
  })

  it('finds a literal union by its members, and counts `literal` as registered', () => {
    expect(start(admits('regex', 'mode'))).toEqual({ operator: 'buildString' })
    expect(start('object', { object: 'literal' })).toEqual({ operator: 'literal' })
  })

  it("cleans a host's node, and never shares it", () => {
    const node = {
      '//': 'A note',
      operator: 'round',
      value: 3.14159,
      path: 'not a parameter of round',
      fallback: { $plus: [1, 2] },
      vars: {},
    }
    const started = start('number', node)
    const { path: _, ...cleaned } = node
    expect(started).toEqual(cleaned)
    expect(started.fallback).not.toBe(node.fallback)
  })
})
