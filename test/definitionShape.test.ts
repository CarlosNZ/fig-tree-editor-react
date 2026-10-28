import { describe, expect, it } from 'vitest'
import { fragmentColors, typeSeeds } from 'fig-tree-evaluator/catalog'
import { type NodeData, type UpdateFunctionProps } from 'json-edit-react'
import {
  allowAdd,
  allowTypeSelection,
  defaultValue,
  newKeyOptions,
  SINGLE_TYPE,
  checkDefinition,
} from '../src/definitionShape'

const listing = {
  displayName: 'Greeting',
  parameterDescriptions: { name: 'Who to greet' },
  seeds: { name: 'World' },
  samples: { name: 'Ada' },
}

const fields = {
  listing,
  parameters: {
    name: { type: 'string' },
    formal: { type: 'boolean', default: false },
  },
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
      expect(newKeyOptions(node([]))).toEqual(['metadata'])
      expect(newKeyOptions(node(['parameters', 'name']))).toEqual(['required', 'default'])
      expect(newKeyOptions(node(['listing']))).toEqual([
        'description',
        'docUrl',
        'colors',
        'metadata',
      ])
      const coloured = { listing: { colors: { background: 'black' } } }
      expect(newKeyOptions(node(['listing', 'colors'], coloured))).toEqual(['text'])
    })

    it('leaves both `metadata` bags free to take any key', () => {
      const bags = { metadata: {}, listing: { metadata: {} } }
      expect(newKeyOptions(node(['metadata'], bags))).toBeNull()
      expect(newKeyOptions(node(['listing', 'metadata'], bags))).toBeNull()
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

    it('offers samples, seeds and parameter descriptions the declared parameters only', () => {
      expect(newKeyOptions(node(['listing', 'samples']))).toEqual(['formal'])
      expect(newKeyOptions(node(['listing', 'seeds']))).toEqual(['formal'])
      expect(newKeyOptions(node(['listing', 'parameterDescriptions']))).toEqual(['formal'])
    })

    it('leaves a parameter free to take any name', () => {
      expect(newKeyOptions(node(['parameters']))).toBeNull()
    })

    it('has no Add where every key is taken', () => {
      const full = { ...fields, listing: { samples: { name: 'Ada', formal: true } } }
      expect(allowAdd(node(['listing', 'samples']))).toBe(true)
      expect(allowAdd(node(['listing', 'samples'], full))).toBe(false)
      expect(allowAdd(node(['parameters']))).toBe(true)
    })
  })

  describe('starting values', () => {
    it('starts a parameter as `any`, as one a reference declares', () => {
      expect(defaultValue(node(['parameters']), 'country')).toEqual({ type: 'any' })
    })

    it("starts `samples` with each required parameter's starting value", () => {
      expect(defaultValue(node(['listing']), 'samples')).toEqual({ name: 'World' })
    })

    it('starts a sample from its seed, otherwise its type, away from its default', () => {
      expect(defaultValue(node(['listing', 'samples']), 'formal')).toBe(true)
      const noSeeds = { ...fields, listing: {} }
      expect(defaultValue(node(['listing', 'samples'], noSeeds), 'name')).toBe(typeSeeds.string)
    })

    it('starts the listing, and its text and colours, ready to fill in', () => {
      expect(defaultValue(node([]), 'listing')).toEqual({})
      expect(defaultValue(node(['listing']), 'description')).toBe('')
      expect(defaultValue(node(['listing']), 'colors')).toEqual(fragmentColors)
      expect(defaultValue(node(['listing', 'parameterDescriptions']), 'formal')).toBe('')
      const coloured = { listing: { colors: { background: 'black' } } }
      expect(defaultValue(node(['listing', 'colors'], coloured), 'text')).toBe(fragmentColors.text)
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
      expect(defaultValue(node(['listing', 'seeds']), 'formal')).toBe(typeSeeds.boolean)
    })
  })

  describe('types', () => {
    it("holds each field to its type, and leaves values' contents free", () => {
      expect(allowTypeSelection(node(['listing']))).toBe(false)
      expect(allowTypeSelection(node(['listing', 'displayName']))).toEqual(['string'])
      expect(allowTypeSelection(node(['parameters', 'name', 'type']))).toEqual([
        SINGLE_TYPE,
        'Multiple',
        'Literal',
      ])
      expect(allowTypeSelection(node(['parameters', 'name']))).toBe(false)
      expect(allowTypeSelection(node(['listing', 'samples', 'name']))).toBe(true)
      expect(allowTypeSelection(node(['listing', 'parameterDescriptions', 'name']))).toEqual([
        'string',
      ])
      const coloured = { listing: { colors: { background: 'black', text: 'white' } } }
      expect(allowTypeSelection(node(['listing', 'colors'], coloured))).toBe(false)
      expect(allowTypeSelection(node(['listing', 'colors', 'text'], coloured))).toEqual(['string'])
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
    it("renames a renamed parameter's sample, seed and description, in place", () => {
      const renamed = {
        ...fields,
        parameters: { who: fields.parameters.name, formal: fields.parameters.formal },
      }
      expect(
        update({ event: 'rename', path: ['parameters', 'name'], newKey: 'who', newData: renamed })
      ).toEqual({
        data: {
          ...renamed,
          listing: {
            displayName: 'Greeting',
            parameterDescriptions: { who: 'Who to greet' },
            seeds: { who: 'World' },
            samples: { who: 'Ada' },
          },
        },
      })
    })

    it("removes a removed parameter's sample, seed and description, however it's removed", () => {
      const removed = { ...fields, parameters: { formal: fields.parameters.formal } }
      const expected = {
        data: {
          ...removed,
          listing: { displayName: 'Greeting', parameterDescriptions: {}, seeds: {}, samples: {} },
        },
      }
      expect(update({ event: 'delete', path: ['parameters', 'name'], newData: removed })).toEqual(
        expected
      )
      expect(update({ event: 'edit', path: ['parameters'], newData: removed })).toEqual(expected)
    })

    it('adds a sample for a new required parameter, where it has none', () => {
      const added = { ...fields, parameters: { ...fields.parameters, country: { type: 'any' } } }
      expect(update({ event: 'add', path: ['parameters', 'country'], newData: added })).toEqual({
        data: {
          ...added,
          listing: { ...listing, samples: { name: 'Ada', country: typeSeeds.any } },
        },
      })
      const optional = {
        ...fields,
        parameters: { ...fields.parameters, country: { type: 'string', default: 'NZ' } },
      }
      expect(update({ event: 'edit', path: ['parameters'], newData: optional })).toBeUndefined()
      const sampled = { ...added, listing: { ...listing, samples: { name: 'Ada', country: 'NZ' } } }
      expect(update({ event: 'edit', path: [], newData: sampled })).toBeUndefined()
    })

    it("adds `samples`, and the listing, for a new parameter's sample, where there is none", () => {
      const { samples: _, ...withoutSamples } = listing
      const added = {
        listing: withoutSamples,
        parameters: { ...fields.parameters, count: { type: 'number' } },
      }
      expect(update({ event: 'add', path: ['parameters', 'count'], newData: added })).toEqual({
        data: { ...added, listing: { ...withoutSamples, samples: { count: typeSeeds.number } } },
      })
      const unlisted = { parameters: { count: { type: 'number' } } }
      expect(update({ event: 'add', path: ['parameters', 'count'], newData: unlisted })).toEqual({
        data: { ...unlisted, listing: { samples: { count: typeSeeds.number } } },
      })
    })

    it('drops constraints when the type stops being an array', () => {
      const constrained = (type: unknown) => ({
        parameters: { list: { type, constraints: { length: 2 } } },
        listing: { samples: { list: [1, 2] } },
      })
      const retyped = constrained('string')
      expect(
        update({ event: 'edit', path: ['parameters', 'list', 'type'], newData: retyped })
      ).toEqual({
        data: { parameters: { list: { type: 'string' } }, listing: { samples: { list: [1, 2] } } },
      })
      const nullable = constrained(['array', 'null'])
      expect(
        update({ event: 'edit', path: ['parameters', 'list', 'type'], newData: nullable })
      ).toBeUndefined()
    })

    it('lets through a change that keeps the shape', () => {
      const edited = { ...fields, listing: { ...listing, description: 'Greets someone' } }
      expect(
        update({ event: 'edit', path: ['listing', 'description'], newData: edited })
      ).toBeUndefined()
      const bag = { ...fields, metadata: { anything: { goes: [1] } } }
      expect(update({ event: 'edit', path: ['metadata'], newData: bag })).toBeUndefined()
    })

    it('refuses a key outside the shape', () => {
      expect(update({ event: 'rename', path: ['metadata'], newData: { meta: {} } })).toEqual({
        error: "'meta' is not a field of a fragment definition",
      })
      const declaration = { ...fields, parameters: { name: { typ: 'string' } }, listing: {} }
      expect(update({ event: 'edit', path: ['parameters'], newData: declaration })).toEqual({
        error: "'typ' is not a field of a parameter declaration",
      })
      const constraint = {
        parameters: { list: { type: 'array', constraints: { size: 2 } } },
        listing: { samples: { list: [] } },
      }
      expect(update({ event: 'edit', path: ['parameters', 'list'], newData: constraint })).toEqual({
        error: "'size' is not a constraint",
      })
      const sample = { ...fields, listing: { samples: { nme: 'Ada' } } }
      expect(
        update({ event: 'rename', path: ['listing', 'samples', 'name'], newData: sample })
      ).toEqual({ error: "'nme' is not a declared parameter" })
      const description = { ...fields, listing: { parameterDescriptions: { nme: 'Who' } } }
      expect(
        update({ event: 'edit', path: ['listing', 'parameterDescriptions'], newData: description })
      ).toEqual({ error: "'nme' is not a declared parameter" })
      const listingField = { ...fields, listing: { colours: {} } }
      expect(update({ event: 'edit', path: ['listing'], newData: listingField })).toEqual({
        error: "'colours' is not a field of a listing",
      })
      const colour = { ...fields, listing: { colors: { fill: 'black' } } }
      expect(update({ event: 'edit', path: ['listing', 'colors'], newData: colour })).toEqual({
        error: "'fill' is not a colour: use 'background' or 'text'",
      })
    })
  })
})
