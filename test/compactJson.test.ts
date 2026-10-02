import { describe, expect, it } from 'vitest'
import { compactJson } from '../src/compactJson'

describe('compact JSON', () => {
  it('writes a value as JSON.stringify does, with no spacing', () => {
    const value = { a: [1, 'two', null, true], b: { c: -1.5 }, d: undefined, e: () => 1 }
    expect(compactJson(value, 200)).toBe(JSON.stringify(value))
    expect(compactJson([undefined, () => 1], 200)).toBe('[null,null]')
    expect(compactJson(new Date(0), 200)).toBe(JSON.stringify(new Date(0)))
  })

  it("quotes strings, so '42' and 42 differ", () => {
    expect(compactJson('42', 200)).toBe('"42"')
    expect(compactJson(42, 200)).toBe('42')
    expect(compactJson('say "hi"', 200)).toBe('"say \\"hi\\""')
  })

  it('cuts at the limit, with an ellipsis', () => {
    expect(compactJson({ name: 'Ada Lovelace' }, 10)).toBe('{"name":"A…')
    expect(compactJson('x'.repeat(50), 8)).toBe('"xxxxxxx…')
    expect(compactJson([1, 2, 3], 7)).toBe('[1,2,3]')
    expect(compactJson([1, 2, 3], 6)).toBe('[1,2,3…')
  })

  it('stops writing at the limit, a value that refers to itself included', () => {
    const looped: Record<string, unknown> = { a: 1 }
    looped.self = looped
    expect(compactJson(looped, 20)).toBe('{"a":1,"self":{"a":1…')
    const large = Array.from({ length: 100_000 }, (_, index) => ({ index }))
    expect(compactJson(large, 30)).toHaveLength(31)
  })

  it('writes what JSON has no form for, at the top, as JavaScript prints it', () => {
    expect(compactJson(undefined, 200)).toBe('undefined')
    expect(compactJson(10n, 200)).toBe('10')
  })
})
