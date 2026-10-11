import { describe, expect, it } from 'vitest'
import { unusedParameters } from '../src/unusedParameters'
import { figTree } from './fixtures'

const unused = (expression: unknown, names: string[]) =>
  unusedParameters(figTree, {
    expression,
    parameters: Object.fromEntries(names.map((name) => [name, {}])),
  }).map(({ path }) => path[1])

describe('unusedParameters', () => {
  it('warns at each declaration the body never reads', () => {
    expect(
      unusedParameters(figTree, { expression: '$params.a', parameters: { a: {}, b: {} } })
    ).toEqual([
      {
        severity: 'warning',
        code: 'unused-param',
        message: "The body never reads 'b'",
        path: ['parameters', 'b'],
      },
    ])
  })

  it('counts every form a read takes', () => {
    const body = {
      drill: '$p.a.x',
      token: { $buildString: { template: 'Hi {{$params.b}}' } },
      get: { $get: { path: 'c', from: '$params' } },
    }
    expect(unused(body, ['a', 'b', 'c', 'd'])).toEqual(['d'])
  })

  it("warns of none where the body's reads can't be listed", () => {
    expect(unused({ all: '$params' }, ['a'])).toEqual([])
    expect(unused({ $get: { path: '$data.key', from: '$params' } }, ['a'])).toEqual([])
  })
})
