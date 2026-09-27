import { describe, expect, it } from 'vitest'
import { displayPath } from '../src/paths'

describe('displayPath', () => {
  it('shows the root as an empty string', () => {
    expect(displayPath([])).toBe('')
  })

  it('joins keys with dots and puts indices in brackets', () => {
    expect(displayPath(['$plus', 1])).toBe('$plus[1]')
    expect(displayPath(['vars', 'country', 0, 'name'])).toBe('vars.country[0].name')
    expect(displayPath([2, 'then'])).toBe('[2].then')
  })

  it('quotes a key that would read ambiguously', () => {
    expect(displayPath(['branches', 'a.b'])).toBe('branches["a.b"]')
    expect(displayPath(['x[0]'])).toBe('["x[0]"]')
    expect(displayPath(['body', ''])).toBe('body[""]')
  })
})
