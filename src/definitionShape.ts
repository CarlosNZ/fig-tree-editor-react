import {
  type ExpectedType,
  type FragmentDefinition,
  type FragmentParameter,
} from 'fig-tree-evaluator'
import {
  type DefaultValueFunction,
  type EnumDefinition,
  type FilterFunction,
  type NewKeyOptionsFunction,
  type TypeFilterFunction,
  type TypeOptions,
  type UpdateFunction,
} from 'json-edit-react'
import { typeSeeds } from 'fig-tree-evaluator/catalog'
import { getStartingValue, typeValue } from './getStartingValue'
import { strings } from './strings'

// The fragment definition editor's rules (fragment-editor-design.md, "The
// definition editor"), which hold the definition to its shape. The editor
// shows a definition less its body, which the expression editor edits. Keys
// are offered from the shape, and a change that would leave a key outside it
// is refused. Renaming or removing a parameter renames or removes its
// entries in `samples` and `metadata.seeds` in the same change.
//
// The values themselves are plain JSON: registration checks them.

export type DefinitionFields = Omit<FragmentDefinition, 'expression'>

type Key = string | number

const FIELDS = ['parameters', 'description', 'samples', 'metadata']
const DECLARATION_FIELDS = ['type', 'required', 'default', 'description', 'metadata', 'constraints']
const METADATA_FIELDS = ['displayName', 'docUrl', 'backgroundColor', 'textColor', 'seeds']

// Where a row is in the definition, by its path
type Place =
  | 'root'
  | 'description'
  | 'declarations' // `parameters`
  | 'declaration'
  | 'declarationField'
  | 'samples'
  | 'sample'
  | 'metadata'
  | 'metadataField'
  | 'seeds' // `metadata.seeds`
  | 'seed'
  | 'within' // inside a value, where anything goes

const placeOf = (path: readonly Key[]): Place => {
  const [field, key] = path
  const depth = path.length
  if (depth === 0) return 'root'
  if (field === 'parameters')
    return (['declarations', 'declaration', 'declarationField'] as const)[depth - 1] ?? 'within'
  if (field === 'samples') return (['samples', 'sample'] as const)[depth - 1] ?? 'within'
  if (field === 'metadata') {
    if (depth === 1) return 'metadata'
    if (key === 'seeds') return depth === 2 ? 'seeds' : depth === 3 ? 'seed' : 'within'
    return depth === 2 ? 'metadataField' : 'within'
  }
  if (field === 'description' && depth === 1) return 'description'
  return 'within'
}

// The rows the definition editor draws with components of its own
// (definitionNodes.tsx): a declaration's `type`, and the two colours
export const isTypeField = ({ path }: { path: readonly Key[] }) =>
  placeOf(path) === 'declarationField' && path[2] === 'type'

export const isColourField = ({ path }: { path: readonly Key[] }) =>
  placeOf(path) === 'metadataField' && (path[1] === 'backgroundColor' || path[1] === 'textColor')

// A declaration's `type` takes one of three forms, each its own entry in the
// type selector: a single basic type, picked from a list; several, as a
// union, which `any` has no place in; or a closed set of literal strings
export const BASIC_TYPES = Object.keys(typeSeeds)
export const UNION_TYPES = BASIC_TYPES.filter((type) => type !== 'any')

export const SINGLE_TYPE: EnumDefinition = {
  enum: strings.FT_TYPE_SINGLE,
  values: BASIC_TYPES,
  // So a declared type shows as this entry, not as a plain string
  matchPriority: 1,
}

export const isLiteralUnion = (value: unknown): value is { literal: string[] } =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  Array.isArray(value.literal) &&
  value.literal.every((member) => typeof member === 'string')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const recordAt = (value: unknown, key: string) =>
  isRecord(value) && isRecord(value[key]) ? value[key] : undefined

const declarationsOf = (fields: unknown) => recordAt(fields, 'parameters') ?? {}

const seedsOf = (fields: unknown) => recordAt(recordAt(fields, 'metadata'), 'seeds') ?? {}

// A declaration's type as fig-tree reads it, `any` where it's missing or not
// a type at all
const typeOf = (declaration: unknown): ExpectedType => {
  const type = isRecord(declaration) ? declaration.type : undefined
  if (typeof type === 'string') return type as ExpectedType
  if (Array.isArray(type) && type.every((member) => typeof member === 'string'))
    return type as ExpectedType
  if (isRecord(type) && Array.isArray(type.literal) && type.literal.length > 0)
    return type as ExpectedType
  return 'any'
}

// A declaration as registration normalises it: required unless it has a
// default, where it doesn't say
const toParameter = (declaration: unknown): FragmentParameter => {
  const authored = isRecord(declaration) ? declaration : {}
  const hasDefault = 'default' in authored
  return {
    type: typeOf(declaration),
    required: typeof authored.required === 'boolean' ? authored.required : !hasDefault,
    ...(hasDefault && { default: authored.default }),
  }
}

const startingValue = (type: ExpectedType) => structuredClone(typeValue(type) ?? null)

// The keys a collection may gain, where the shape lists them
const keysFor = (place: Place, fields: unknown): string[] | null => {
  if (place === 'root') return FIELDS
  if (place === 'declaration') return DECLARATION_FIELDS
  if (place === 'metadata') return METADATA_FIELDS
  if (place === 'samples' || place === 'seeds') return Object.keys(declarationsOf(fields))
  return null
}

const notYetIn = (keys: string[], value: unknown) =>
  keys.filter((key) => !(isRecord(value) && key in value))

export const newKeyOptions: NewKeyOptionsFunction = ({ path, value, fullData }) => {
  const keys = keysFor(placeOf(path), fullData)
  return keys && notYetIn(keys, value)
}

// A collection whose keys are all taken has no Add
export const allowAdd: FilterFunction = ({ path, value, fullData }) => {
  const keys = keysFor(placeOf(path), fullData)
  return keys === null || notYetIn(keys, value).length > 0
}

export const defaultValue: DefaultValueFunction = ({ path, value, fullData }, newKey) => {
  if (newKey === undefined) return null
  switch (placeOf(path)) {
    case 'root':
      return newField(newKey, fullData)
    case 'declarations':
      return { type: 'any' }
    case 'declaration':
      return newDeclarationField(newKey, value)
    case 'samples':
      return sampleValue(newKey, fullData)
    case 'metadata':
      return newMetadataField(newKey)
    case 'seeds':
      return startingValue(typeOf(declarationsOf(fullData)[newKey]))
    default:
      return null
  }
}

// A sample is what a call would start the parameter as, so new samples are
// the required parameters' starting values
const newField = (key: string, fields: unknown) => {
  if (key === 'description') return ''
  if (key !== 'samples') return {}
  const declarations = declarationsOf(fields)
  return Object.fromEntries(
    Object.keys(declarations)
      .filter((name) => toParameter(declarations[name]).required)
      .map((name) => [name, sampleValue(name, fields)])
  )
}

const sampleValue = (name: string, fields: unknown) =>
  getStartingValue(name, toParameter(declarationsOf(fields)[name]), seedsOf(fields)) ?? null

// `required` starts as the opposite of what the declaration already means,
// since adding it is how an author changes that
const newDeclarationField = (key: string, declaration: unknown) => {
  switch (key) {
    case 'type':
      return 'string'
    case 'required':
      return !toParameter(declaration).required
    case 'default':
      return startingValue(typeOf(declaration))
    case 'description':
      return ''
    default:
      return {}
  }
}

const newMetadataField = (key: string) => {
  switch (key) {
    case 'backgroundColor':
      return '#ffffff'
    case 'textColor':
      return '#000000'
    case 'seeds':
      return {}
    default:
      return ''
  }
}

const DECLARATION_TYPES: Record<string, boolean | TypeOptions> = {
  type: [SINGLE_TYPE, strings.FT_TYPE_MULTIPLE, strings.FT_TYPE_LITERAL],
  required: ['boolean'],
  default: true,
  description: ['string'],
  metadata: false,
  constraints: false,
}

const METADATA_TYPES: Record<string, boolean | TypeOptions> = {
  displayName: ['string'],
  docUrl: ['string'],
  backgroundColor: ['string'],
  textColor: ['string'],
  seeds: false,
}

export const allowTypeSelection: TypeFilterFunction = ({ path, key }) => {
  switch (placeOf(path)) {
    case 'root':
    case 'declarations':
    case 'declaration':
    case 'samples':
    case 'metadata':
    case 'seeds':
      return false
    case 'description':
      return ['string']
    case 'declarationField':
      return DECLARATION_TYPES[String(key)] ?? true
    case 'metadataField':
      return METADATA_TYPES[String(key)] ?? true
    default:
      return true
  }
}

// Each change: a parameter's entries follow it, then the result is held to
// the shape
export const updateDefinition: UpdateFunction = (update) => {
  const next = followParameters(update.fullData, update.newData, update)
  const problem = findShapeProblem(next)
  if (problem !== undefined) return { error: problem }
  return next === update.newData ? undefined : { data: next }
}

// A renamed parameter's entries are renamed, in place, and a removed
// parameter's are removed, however it was removed
const followParameters = (
  previous: unknown,
  next: unknown,
  change: { event: string; path: Key[]; newKey?: string }
) => {
  if (!isRecord(next)) return next
  const [field, name] = change.path
  if (change.event === 'rename' && field === 'parameters' && change.path.length === 2)
    return withEntries(next, (entries) =>
      renameKey(entries, String(name), change.newKey ?? String(name))
    )
  const declared = declarationsOf(next)
  const removed = Object.keys(declarationsOf(previous)).filter((key) => !(key in declared))
  if (removed.length === 0) return next
  return withEntries(next, (entries) =>
    Object.fromEntries(Object.entries(entries).filter(([key]) => !removed.includes(key)))
  )
}

// The definition with `samples` and `metadata.seeds` changed, each only where
// it changes, so an unchanged definition stays the same object
const withEntries = (
  fields: Record<string, unknown>,
  change: (entries: Record<string, unknown>) => Record<string, unknown>
) => {
  let result = fields
  const samples = recordAt(fields, 'samples')
  if (samples) {
    const changed = change(samples)
    if (!sameKeys(changed, samples)) result = { ...result, samples: changed }
  }
  const metadata = recordAt(fields, 'metadata')
  const seeds = recordAt(metadata, 'seeds')
  if (metadata && seeds) {
    const changed = change(seeds)
    if (!sameKeys(changed, seeds)) result = { ...result, metadata: { ...metadata, seeds: changed } }
  }
  return result
}

const renameKey = (entries: Record<string, unknown>, from: string, to: string) =>
  Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key === from ? to : key, value])
  )

const sameKeys = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(a).join('\n') === Object.keys(b).join('\n')

const findShapeProblem = (fields: unknown): string | undefined => {
  if (!isRecord(fields)) return undefined
  const unknownField = Object.keys(fields).find((key) => !FIELDS.includes(key))
  if (unknownField !== undefined) return strings.FT_NOT_A_DEFINITION_FIELD(unknownField)
  const declarations = declarationsOf(fields)
  for (const declaration of Object.values(declarations)) {
    if (!isRecord(declaration)) continue
    const unknownKey = Object.keys(declaration).find((key) => !DECLARATION_FIELDS.includes(key))
    if (unknownKey !== undefined) return strings.FT_NOT_A_DECLARATION_FIELD(unknownKey)
  }
  const undeclared = [
    ...Object.keys(recordAt(fields, 'samples') ?? {}),
    ...Object.keys(seedsOf(fields)),
  ].find((key) => !(key in declarations))
  if (undeclared !== undefined) return strings.FT_NOT_A_DECLARED_PARAMETER(undeclared)
  return undefined
}
