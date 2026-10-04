import {
  isCollection,
  type DefaultValueFunction,
  type NewKeyOptionsFunction,
  type TypeFilterFunction,
} from 'json-edit-react'
import { type ExpectedType, type FragmentDefinition } from 'fig-tree-evaluator'
import { startingValueFor } from './operatorDefaults'

// The Configuration panel's fragments editor, held to the shape of a fragment
// definition. A fragment can have any name, and starts as a complete one that
// runs as it is. FigTree checks the definitions on Save rather than on each
// change, since renaming a parameter and the expression's reference to it is
// two changes, with an invalid fragment between them.

// Levels in the editor: the root, a fragment, its fields, a parameter, then a
// parameter's fields
const ROOT = 0
const FRAGMENT = 1
const FIELD = 2
const PARAMETER = 3
const PARAMETER_FIELD = 4

const FRAGMENT_FIELDS = ['expression', 'parameters', 'description', 'metadata']
const PARAMETER_FIELDS = ['type', 'required', 'default', 'description', 'metadata', 'constraints']

// One parameter, used in the expression, with a default so the fragment runs
// without arguments. The metadata is what fig-tree-editor-react shows it as.
const newFragment = (name: string): FragmentDefinition => ({
  expression: { operator: 'plus', values: ['Hello, ', '$params.name', '!'] },
  parameters: { name: { type: 'string', default: 'World', description: 'Who to greet' } },
  description: 'Greets someone by name',
  metadata: { displayName: name, backgroundColor: '#e8e0f8', textColor: '#4b2a8a' },
})

const NEW_FIELDS: Record<string, unknown> = {
  expression: null,
  parameters: {},
  description: '',
  metadata: {},
}

const NEW_PARAMETER_FIELDS: Record<string, unknown> = {
  type: 'string',
  required: false,
  description: '',
  metadata: {},
  constraints: {},
}

// Whether a path is inside a fragment's `parameters`: [name, 'parameters', ...]
const inParameters = (path: (string | number)[]) => path[1] === 'parameters'

const newKeyOptions: NewKeyOptionsFunction = ({ level, path, value }) => {
  const taken = Object.keys(value as object)
  if (level === FRAGMENT) return FRAGMENT_FIELDS.filter((key) => !taken.includes(key))
  if (level === PARAMETER && inParameters(path))
    return PARAMETER_FIELDS.filter((key) => !taken.includes(key))
  return null
}

const defaultValue: DefaultValueFunction = ({ level, path, value }, newKey) => {
  if (newKey === undefined) return null
  if (level === ROOT) return newFragment(newKey)
  if (level === FRAGMENT) return NEW_FIELDS[newKey] ?? null
  if (level === FIELD && inParameters(path)) return { type: 'string' }
  if (level === PARAMETER && inParameters(path)) {
    // A default of the parameter's declared type
    const { type } = value as { type?: unknown }
    if (newKey === 'default')
      return typeof type === 'string' || isCollection(type)
        ? startingValueFor(type as ExpectedType)
        : null
    return NEW_PARAMETER_FIELDS[newKey] ?? null
  }
  return null
}

const allowTypeSelection: TypeFilterFunction = ({ level, key, path }) => {
  if (level < FIELD) return false
  if (level === FIELD) {
    if (key === 'expression') return true
    if (key === 'description') return ['string']
    return false
  }
  if (level === PARAMETER && inParameters(path)) return false
  if (level === PARAMETER_FIELD && inParameters(path)) {
    // A type is a name, a list of names, or `{ literal: [...] }`
    if (key === 'type') return ['string', 'array', 'object']
    if (key === 'required') return ['boolean']
    if (key === 'description') return ['string']
    if (key === 'default') return true
    return false
  }
  return true
}

export const fragmentsRestrictions = { newKeyOptions, defaultValue, allowTypeSelection }
