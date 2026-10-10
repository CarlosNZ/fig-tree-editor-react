import { describe, expect, it } from 'vitest'
import { type CustomNodeDefinition, type NodeData } from 'json-edit-react'
import { definitionNodes } from '../src/definitionNodes'

const definition = (name: string) =>
  definitionNodes.find((node) => node.name === name) as CustomNodeDefinition
const nodeData = {} as NodeData

describe('definitionNodes', () => {
  it('switches a single type into a union as its one member, where it can be one', () => {
    const { fromStandardType } = definition('Multiple')
    expect(fromStandardType?.('string', nodeData, {})).toEqual(['string'])
    expect(fromStandardType?.('any', nodeData, {})).toEqual([])
    expect(fromStandardType?.(['number', 'null'], nodeData, {})).toEqual(['number', 'null'])
  })

  it('switches a union away as its first member', () => {
    expect(definition('Multiple').toStandardType?.(['number', 'null'])).toBe('number')
  })

  it('starts a literal union empty, and switches it away as `string`', () => {
    const { fromStandardType, toStandardType } = definition('Literal')
    expect(fromStandardType?.('number', nodeData, {})).toEqual({ literal: [] })
    expect(fromStandardType?.({ literal: ['a'] }, nodeData, {})).toEqual({ literal: ['a'] })
    expect(toStandardType?.({ literal: ['a'] })).toBe('string')
  })

  it("draws chips only on a declaration's `type`", () => {
    const at = (path: (string | number)[], value: unknown) =>
      ({ path, key: path.at(-1), value }) as unknown as NodeData
    expect(definition('Multiple').condition(at(['parameters', 'x', 'type'], ['string']))).toBe(true)
    expect(definition('Multiple').condition(at(['samples', 'x'], ['string']))).toBe(false)
    expect(definition('Literal').condition(at(['parameters', 'x', 'type'], { literal: [] }))).toBe(
      true
    )
  })
})
