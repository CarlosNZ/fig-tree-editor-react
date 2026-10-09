import { describe, expect, it } from 'vitest'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { type NodeData, type UpdateFunctionProps } from 'json-edit-react'
import {
  allowAdd,
  allowTypeSelection,
  defaultValue,
  newKeyOptions,
  updateDefinition,
} from '../src/definitionShape'

const fields = {
  parameters: {
    name: { type: 'string', description: 'Who to greet' },
    formal: { type: 'boolean', default: false },
  },
  samples: { name: 'Ada' },
  metadata: { displayName: 'Greeting', seeds: { name: 'World' } },
}

const valueAt = (data: unknown, path: (string | number)[]) =>
  path.reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], data)

const node = (path: (string | number)[], fullData: unknown = fields) =>
  ({ path, key: path.at(-1), value: valueAt(fullData, path), fullData }) as unknown as NodeData

const update = (change: Record<string, unknown>) =>
  updateDefinition(
    { fullData: fields, ...change } as unknown as UpdateFunctionProps,
    {} as Parameters<typeof updateDefinition>[1]
  )

describe('definitionShape', () => {
  describe('new keys', () => {
    it("offers each collection the shape's keys it doesn't have yet", () => {
      expect(newKeyOptions(node([]))).toEqual(['description'])
      expect(newKeyOptions(node(['parameters', 'name']))).toEqual([
        'required',
        'default',
        'metadata',
        'constraints',
      ])
      expect(newKeyOptions(node(['metadata']))).toEqual(['docUrl', 'backgroundColor', 'textColor'])
    })

    it('offers samples and seeds the declared parameters only', () => {
      expect(newKeyOptions(node(['samples']))).toEqual(['formal'])
      expect(newKeyOptions(node(['metadata', 'seeds']))).toEqual(['formal'])
    })

    it('leaves a parameter free to take any name', () => {
      expect(newKeyOptions(node(['parameters']))).toBeNull()
    })

    it('has no Add where every key is taken', () => {
      const full = { ...fields, samples: { name: 'Ada', formal: true } }
      expect(allowAdd(node(['samples']))).toBe(true)
      expect(allowAdd(node(['samples'], full))).toBe(false)
      expect(allowAdd(node(['parameters']))).toBe(true)
    })
  })

  describe('starting values', () => {
    it('starts a parameter as `any`, as one a reference declares', () => {
      expect(defaultValue(node(['parameters']), 'country')).toEqual({ type: 'any' })
    })

    it("starts `samples` with each required parameter's starting value", () => {
      const { samples: _, ...withoutSamples } = fields
      expect(defaultValue(node([], withoutSamples), 'samples')).toEqual({ name: 'World' })
    })

    it('starts a sample from its seed, otherwise its type, away from its default', () => {
      expect(defaultValue(node(['samples']), 'formal')).toBe(true)
      const noSeeds = { ...fields, metadata: {} }
      expect(defaultValue(node(['samples'], noSeeds), 'name')).toBe(typeSeeds.string)
    })

    it('starts `required` as the opposite of what the declaration means', () => {
      expect(defaultValue(node(['parameters', 'name']), 'required')).toBe(false)
      expect(defaultValue(node(['parameters', 'formal']), 'required')).toBe(true)
    })

    it("starts a default or a seed as a value of the parameter's type", () => {
      expect(defaultValue(node(['parameters', 'name']), 'default')).toBe(typeSeeds.string)
      expect(defaultValue(node(['metadata', 'seeds']), 'formal')).toBe(typeSeeds.boolean)
    })
  })

  describe('types', () => {
    it("holds each field to its type, and leaves values' contents free", () => {
      expect(allowTypeSelection(node(['description']))).toEqual(['string'])
      expect(allowTypeSelection(node(['parameters', 'name', 'type']))).toEqual([
        'string',
        'array',
        'object',
      ])
      expect(allowTypeSelection(node(['parameters', 'name']))).toBe(false)
      expect(allowTypeSelection(node(['metadata', 'displayName']))).toEqual(['string'])
      expect(allowTypeSelection(node(['samples', 'name']))).toBe(true)
    })
  })

  describe('changes', () => {
    it("renames a renamed parameter's sample and seed, in place", () => {
      const renamed = {
        ...fields,
        parameters: { who: fields.parameters.name, formal: fields.parameters.formal },
      }
      expect(
        update({ event: 'rename', path: ['parameters', 'name'], newKey: 'who', newData: renamed })
      ).toEqual({
        data: {
          ...renamed,
          samples: { who: 'Ada' },
          metadata: { displayName: 'Greeting', seeds: { who: 'World' } },
        },
      })
    })

    it("removes a removed parameter's sample and seed, however it's removed", () => {
      const removed = { ...fields, parameters: { formal: fields.parameters.formal } }
      const expected = {
        data: { ...removed, samples: {}, metadata: { displayName: 'Greeting', seeds: {} } },
      }
      expect(update({ event: 'delete', path: ['parameters', 'name'], newData: removed })).toEqual(
        expected
      )
      expect(update({ event: 'edit', path: ['parameters'], newData: removed })).toEqual(expected)
    })

    it('lets through a change that keeps the shape', () => {
      const edited = { ...fields, description: 'Greets someone' }
      expect(update({ event: 'edit', path: ['description'], newData: edited })).toBeUndefined()
    })

    it('refuses a key outside the shape', () => {
      expect(update({ event: 'rename', path: ['metadata'], newData: { meta: {} } })).toEqual({
        error: "'meta' is not a field of a fragment definition",
      })
      const declaration = { ...fields, parameters: { name: { typ: 'string' } }, samples: {} }
      expect(update({ event: 'edit', path: ['parameters'], newData: declaration })).toEqual({
        error: "'typ' is not a field of a parameter declaration",
      })
      const sample = { ...fields, samples: { nme: 'Ada' } }
      expect(update({ event: 'rename', path: ['samples', 'name'], newData: sample })).toEqual({
        error: "'nme' is not a declared parameter",
      })
    })
  })
})
