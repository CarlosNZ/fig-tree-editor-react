import { describe, expect, it } from 'vitest'
import { buildDisplayData } from '../src/displayData'
import { getStartingValue } from '../src/getStartingValue'
import { registry } from './fixtures'

const displayData = buildDisplayData(registry)
const start = (operator: string, parameter: string) => {
  const declaration = registry.operators.find(({ name }) => name === operator)!.parameters[
    parameter
  ]
  return getStartingValue(parameter, declaration, displayData.operators[operator].seeds)
}

// The design's table (topic 4, "Adding parameters and starting values")
describe('getStartingValue', () => {
  it.each<[string, string, unknown, string]>([
    ['if', 'then', 'The condition is true', 'the seed'],
    ['round', 'decimals', 2, 'the seed'],
    ['split', 'trim', false, 'the seed'],
    ['http', 'timeout', 5000, 'the seed'],
    ['equal', 'caseInsensitive', true, 'the boolean type seed'],
    ['plus', 'expect', 'number', "the literal union's first member"],
    ['plus', 'nullValueDefault', 1, 'the type seed of the first non-null member'],
    ['find', 'noMatchDefault', 'Replace me', 'the any type seed'],
    ['regex', 'mode', 'extract', 'not the default'],
  ])('starts %s.%s as %j, from %s', (operator, parameter, value) => {
    expect(start(operator, parameter)).toEqual(value)
  })

  it('moves a boolean off its effective default, instance defaults included', () => {
    const declaration = { type: 'boolean' as const, required: false, default: true }
    expect(getStartingValue('flag', declaration, {})).toBe(false)
    expect(getStartingValue('flag', { ...declaration, instanceDefault: false }, {})).toBe(true)
  })

  it('never shares a seed object with the display data', () => {
    const seeds = { branches: { a: 1 } }
    const value = getStartingValue('branches', { type: 'object', required: true }, seeds)
    expect(value).toEqual(seeds.branches)
    expect(value).not.toBe(seeds.branches)
  })
})
