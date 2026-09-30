import { describe, expect, it } from 'vitest'
import { describeType } from '../src/describeType'

describe('describeType', () => {
  it('names a single type', () => {
    expect(describeType('string')).toBe('a string')
    expect(describeType('integer')).toBe('an integer')
    expect(describeType('any')).toBe('anything')
  })

  it('lists a union, with "or" before the last', () => {
    expect(describeType(['number', 'null'])).toBe('a number or null')
    expect(describeType(['boolean', 'string', 'array', 'null'])).toBe(
      'a boolean, a string, an array or null'
    )
    expect(describeType(['string', 'any'])).toBe('anything')
  })

  it('quotes the values of a literal union', () => {
    expect(describeType({ literal: ['test', 'extract', 'match'] })).toBe(
      "one of 'test', 'extract' or 'match'"
    )
    expect(describeType({ literal: [1, 2] })).toBe('one of 1 or 2')
    expect(describeType({ literal: ['only'] })).toBe("'only'")
  })
})
