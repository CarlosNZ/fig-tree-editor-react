import { describe, expect, it } from 'vitest'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { type NodeData, type UpdateFunctionProps } from 'json-edit-react'
import {
  allowAdd,
  allowTypeSelection,
  defaultValue,
  newKeyOptions,
  SINGLE_TYPE,
  checkDefinition,
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
  checkDefinition({ fullData: fields, ...change } as unknown as UpdateFunctionProps)

describe('definitionShape', () => {
  describe('new keys', () => {
    it("offers each collection the shape's keys it doesn't have yet", () => {
      expect(newKeyOptions(node([]))).toEqual(['description'])
      expect(newKeyOptions(node(['parameters', 'name']))).toEqual([
        'required',
        'default',
        'metadata',
      ])
      expect(newKeyOptions(node(['metadata']))).toEqual(['docUrl', 'backgroundColor', 'textColor'])
    })

    it('offers `constraints` where the type is an array, and the three constraints', () => {
      const declare = (type: unknown) => ({
        ...fields,
        parameters: { list: { type, constraints: { length: 2 } } },
      })
      const offered = (type: unknown) =>
        newKeyOptions(node(['parameters', 'list'], { parameters: { list: { type } } }))
      expect(offered('array')).toContain('constraints')
      expect(offered(['array', 'null'])).toContain('constraints')
      expect(offered('any')).not.toContain('constraints')
      expect(offered(['array', 'string'])).not.toContain('constraints')
      expect(newKeyOptions(node(['parameters', 'list', 'constraints'], declare('array')))).toEqual([
        'homogeneous',
        'elementShape',
      ])
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

    it('starts each constraint as one that holds', () => {
      const path = ['parameters', 'list', 'constraints']
      const list = { parameters: { list: { type: 'array', constraints: {} } } }
      expect(defaultValue(node(path, list), 'length')).toBe(2)
      expect(defaultValue(node(path, list), 'homogeneous')).toEqual(['string'])
      expect(defaultValue(node(path, list), 'elementShape')).toEqual({})
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
        SINGLE_TYPE,
        'Multiple',
        'Literal',
      ])
      expect(allowTypeSelection(node(['parameters', 'name']))).toBe(false)
      expect(allowTypeSelection(node(['metadata', 'displayName']))).toEqual(['string'])
      expect(allowTypeSelection(node(['samples', 'name']))).toBe(true)
      const list = {
        parameters: {
          list: { type: 'array', constraints: { length: 2, homogeneous: ['string'] } },
        },
      }
      const constraints = ['parameters', 'list', 'constraints']
      expect(allowTypeSelection(node(constraints, list))).toBe(false)
      expect(allowTypeSelection(node([...constraints, 'length'], list))).toEqual(['number'])
      expect(allowTypeSelection(node([...constraints, 'homogeneous'], list))).toBe(false)
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

    it('adds a sample for a new required parameter, where it has none', () => {
      const added = { ...fields, parameters: { ...fields.parameters, country: { type: 'any' } } }
      expect(update({ event: 'add', path: ['parameters', 'country'], newData: added })).toEqual({
        data: { ...added, samples: { name: 'Ada', country: typeSeeds.any } },
      })
      const optional = {
        ...fields,
        parameters: { ...fields.parameters, country: { type: 'string', default: 'NZ' } },
      }
      expect(update({ event: 'edit', path: ['parameters'], newData: optional })).toBeUndefined()
      const sampled = { ...added, samples: { name: 'Ada', country: 'NZ' } }
      expect(update({ event: 'edit', path: [], newData: sampled })).toBeUndefined()
    })

    it("adds `samples` for a new parameter's sample, where there is none", () => {
      const { samples: _, ...withoutSamples } = fields
      const added = {
        ...withoutSamples,
        parameters: { ...fields.parameters, count: { type: 'number' } },
      }
      expect(update({ event: 'add', path: ['parameters', 'count'], newData: added })).toEqual({
        data: { ...added, samples: { count: typeSeeds.number } },
      })
    })

    it('drops constraints when the type stops being an array', () => {
      const constrained = (type: unknown) => ({
        parameters: { list: { type, constraints: { length: 2 } } },
        samples: { list: [1, 2] },
      })
      const retyped = constrained('string')
      expect(
        update({ event: 'edit', path: ['parameters', 'list', 'type'], newData: retyped })
      ).toEqual({
        data: { parameters: { list: { type: 'string' } }, samples: { list: [1, 2] } },
      })
      const nullable = constrained(['array', 'null'])
      expect(
        update({ event: 'edit', path: ['parameters', 'list', 'type'], newData: nullable })
      ).toBeUndefined()
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
      const constraint = {
        parameters: { list: { type: 'array', constraints: { size: 2 } } },
        samples: { list: [] },
      }
      expect(update({ event: 'edit', path: ['parameters', 'list'], newData: constraint })).toEqual({
        error: "'size' is not a constraint",
      })
      const sample = { ...fields, samples: { nme: 'Ada' } }
      expect(update({ event: 'rename', path: ['samples', 'name'], newData: sample })).toEqual({
        error: "'nme' is not a declared parameter",
      })
    })
  })
})
