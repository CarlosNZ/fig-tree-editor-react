import { describe, expect, it } from 'vitest'
import { classify } from '../src/classify'
import { declareParameters } from '../src/declareParameters'
import { figTree, registry } from './fixtures'

const declare = (body: unknown, declarations?: Record<string, { type?: unknown }>) =>
  declareParameters(
    body,
    declarations as Parameters<typeof declareParameters>[1],
    figTree,
    classify(body, registry)
  )

// What a position admits, read from the classification
const admitsAt = (body: unknown, path: (string | number)[]) =>
  [...classify(body, registry).values()].find(
    (row) => JSON.stringify(row.slot?.path) === JSON.stringify(path)
  )?.slot?.admits

describe('declareParameters', () => {
  it('returns the declarations as given where every parameter read is declared', () => {
    const declarations = { name: { type: 'string' } }
    expect(declare({ $plus: ['Hi ', '$params.name'] }, declarations)).toBe(declarations)
    expect(declare({ $plus: [1, 2] })).toBeUndefined()
  })

  it('declares a new parameter with the type its position admits', () => {
    const body = { operator: 'if', condition: '$params.formal', then: 'a', else: 'b' }
    expect(declare(body)).toEqual({ formal: { type: admitsAt(body, ['condition']) } })

    const sum = { operator: 'plus', values: [1, '$p.amount'] }
    const type = admitsAt(sum, ['values', 1])
    expect(type).not.toBe('any')
    expect(declare(sum)).toEqual({ amount: { type } })
  })

  it("declares `any` where the position doesn't type the parameter itself", () => {
    const drill = { operator: 'if', condition: '$params.user.active', then: 'a', else: 'b' }
    expect(declare(drill)).toEqual({ user: { type: 'any' } })
    expect(declare({ value: '$params.anything' })).toEqual({ anything: { type: 'any' } })
    expect(declare({ $buildString: 'Hi {{$params.name}}' })).toEqual({ name: { type: 'any' } })
  })

  it('declares `any` where positions of the same new name disagree', () => {
    const agree = { operator: 'plus', values: ['$params.x', '$params.x'] }
    expect(declare(agree)).toEqual({ x: { type: admitsAt(agree, ['values', 0]) } })
    const disagree = {
      operator: 'plus',
      values: ['$params.x', { operator: 'round', value: '$params.x' }],
    }
    expect(admitsAt(disagree, ['values', 0])).not.toEqual(
      admitsAt(disagree, ['values', 1, 'value'])
    )
    expect(declare(disagree)).toEqual({ x: { type: 'any' } })
  })

  it('keeps the existing declarations, unchanged and first', () => {
    const declarations = { name: { type: 'any' } }
    const body = { operator: 'plus', values: ['$params.name', '$params.greeting'] }
    const declared = declare(body, declarations)
    expect(Object.keys(declared ?? {})).toEqual(['name', 'greeting'])
    expect(declared?.name).toBe(declarations.name)
  })

  it("counts a fragment call's arguments", () => {
    const call = { fragment: 'greet', parameters: { name: '$params.who' } }
    expect(Object.keys(declare(call) ?? {})).toEqual(['who'])
  })
})
