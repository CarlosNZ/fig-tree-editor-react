import {
  type ColorPair,
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
import { fragmentColors, typeSeeds } from 'fig-tree-evaluator/catalog'
import { getStartingValue, typeValue } from './getStartingValue'
import { strings } from './strings'

// The fragment definition editor's rules (fragment-editor-design.md, "The
// definition editor"), which hold the definition to its shape. The editor
// shows a definition less its body, which the expression editor edits. Keys
// are offered from the shape, and a change that would leave a key outside it
// is refused. Renaming or removing a parameter renames or removes its
// entries in the listing's `samples`, `seeds` and `parameterDescriptions` in
// the same change, and a new required parameter gets a sample. A
// declaration's `constraints` are offered and kept only where its type is an
// array. Both `metadata` bags, the definition's and the listing's, are the
// host's own, so anything goes inside them.
//
// The values themselves are plain JSON: registration checks them, and
// `getCatalog` checks the listing's.

export type DefinitionFields = Omit<FragmentDefinition, 'expression'>

type Key = string | number

const FIELDS = ['listing', 'parameters', 'metadata']
const DECLARATION_FIELDS = ['type', 'required', 'default', 'constraints']
const CONSTRAINT_FIELDS = ['length', 'homogeneous', 'elementShape']
const LISTING_FIELDS = [
  'displayName',
  'description',
  'parameterDescriptions',
  'docUrl',
  'colors',
  'seeds',
  'samples',
  'metadata',
]
const COLOR_FIELDS = ['background', 'text']
// The listing's fields keyed by parameter name
const BY_PARAMETER = ['parameterDescriptions', 'seeds', 'samples']

// Where a row is in the definition, by its path
type Place =
  | 'root'
  | 'declarations' // `parameters`
  | 'declaration'
  | 'declarationField'
  | 'constraints' // a declaration's `constraints`
  | 'constraintField'
  | 'listing'
  | 'listingField' // `displayName`, `description` or `docUrl`
  | 'colors'
  | 'colorField'
  | 'byParameter' // `parameterDescriptions`, `seeds` or `samples`
  | 'parameterEntry'
  | 'metadata' // the definition's or the listing's
  | 'within' // inside a value, where anything goes

const placeOf = (path: readonly Key[]): Place => {
  const [field, key] = path
  const depth = path.length
  if (depth === 0) return 'root'
  if (field === 'parameters') {
    if (path[2] === 'constraints')
      return depth === 3 ? 'constraints' : depth === 4 ? 'constraintField' : 'within'
    return (['declarations', 'declaration', 'declarationField'] as const)[depth - 1] ?? 'within'
  }
  if (field === 'listing') {
    if (depth === 1) return 'listing'
    if (key === 'colors') return (['colors', 'colorField'] as const)[depth - 2] ?? 'within'
    if (BY_PARAMETER.includes(String(key)))
      return (['byParameter', 'parameterEntry'] as const)[depth - 2] ?? 'within'
    if (key === 'metadata') return depth === 2 ? 'metadata' : 'within'
    return depth === 2 ? 'listingField' : 'within'
  }
  if (field === 'metadata' && depth === 1) return 'metadata'
  return 'within'
}

// The rows the definition editor draws with components of its own
// (definitionNodes.tsx): a declaration's `type`, its `homogeneous`
// constraint, and the listing's two colours
export const isTypeField = ({ path }: { path: readonly Key[] }) =>
  placeOf(path) === 'declarationField' && path[2] === 'type'

export const isHomogeneousField = ({ path }: { path: readonly Key[] }) =>
  placeOf(path) === 'constraintField' && path[3] === 'homogeneous'

export const isColourField = ({ path }: { path: readonly Key[] }) =>
  placeOf(path) === 'colorField' && COLOR_FIELDS.includes(String(path[2]))

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

const listingOf = (fields: unknown) => recordAt(fields, 'listing') ?? {}

const seedsOf = (fields: unknown) => recordAt(listingOf(fields), 'seeds') ?? {}

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

// Constraints need an array, though `null` skips them, so they fit a type
// whose members are all `array`, or `null`
const takesConstraints = (type: ExpectedType) =>
  type === 'array' ||
  (Array.isArray(type) &&
    type.includes('array') &&
    type.every((member) => member === 'array' || member === 'null'))

const startingValue = (type: ExpectedType) => structuredClone(typeValue(type) ?? null)

// The keys a collection may gain, where the shape lists them
const keysFor = (place: Place, fields: unknown, value: unknown): string[] | null => {
  if (place === 'root') return FIELDS
  if (place === 'declaration')
    return takesConstraints(typeOf(value))
      ? DECLARATION_FIELDS
      : DECLARATION_FIELDS.filter((key) => key !== 'constraints')
  if (place === 'constraints') return CONSTRAINT_FIELDS
  if (place === 'listing') return LISTING_FIELDS
  if (place === 'colors') return COLOR_FIELDS
  if (place === 'byParameter') return Object.keys(declarationsOf(fields))
  return null
}

const notYetIn = (keys: string[], value: unknown) =>
  keys.filter((key) => !(isRecord(value) && key in value))

export const newKeyOptions: NewKeyOptionsFunction = ({ path, value, fullData }) => {
  const keys = keysFor(placeOf(path), fullData, value)
  return keys && notYetIn(keys, value)
}

// A collection whose keys are all taken has no Add
export const allowAdd: FilterFunction = ({ path, value, fullData }) => {
  const keys = keysFor(placeOf(path), fullData, value)
  return keys === null || notYetIn(keys, value).length > 0
}

export const defaultValue: DefaultValueFunction = ({ path, value, fullData }, newKey) => {
  if (newKey === undefined) return null
  switch (placeOf(path)) {
    case 'root':
      return {}
    case 'declarations':
      return { type: 'any' }
    case 'declaration':
      return newDeclarationField(newKey, value)
    case 'constraints':
      return newConstraint(newKey)
    case 'listing':
      return newListingField(newKey, fullData)
    case 'colors':
      return fragmentColors[newKey as keyof ColorPair]
    case 'byParameter':
      return newEntry(String(path[1]), newKey, fullData)
    default:
      return null
  }
}

// The colours start as those a fragment without any is drawn in. A sample is
// what a call would start the parameter as, so new samples are the required
// parameters' starting values.
const newListingField = (key: string, fields: unknown) => {
  switch (key) {
    case 'displayName':
    case 'description':
    case 'docUrl':
      return ''
    case 'colors':
      return { ...fragmentColors }
    case 'samples': {
      const declarations = declarationsOf(fields)
      return Object.fromEntries(
        Object.keys(declarations)
          .filter((name) => toParameter(declarations[name]).required)
          .map((name) => [name, sampleValue(name, fields)])
      )
    }
    default:
      return {}
  }
}

const newEntry = (field: string, name: string, fields: unknown) => {
  switch (field) {
    case 'samples':
      return sampleValue(name, fields)
    case 'seeds':
      return startingValue(typeOf(declarationsOf(fields)[name]))
    default:
      return ''
  }
}

const sampleValue = (name: string, fields: unknown) =>
  getStartingValue(name, toParameter(declarationsOf(fields)[name]), seedsOf(fields)) ?? null

// The definition with a sample for each required parameter declared in it
// and not in `previous`, where it has none, as a new `samples` field gives
// them. A declaration starts required, however it's added, so each starts
// with a sample, and a ▶ is never refused for want of one.
export const addSamples = <T>(previous: unknown, next: T): T => {
  if (!isRecord(next)) return next
  const listing = next.listing ?? {}
  if (!isRecord(listing) || ('samples' in listing && !isRecord(listing.samples))) return next
  const before = declarationsOf(previous)
  const declarations = declarationsOf(next)
  const samples = recordAt(listing, 'samples') ?? {}
  const added = Object.keys(declarations).filter(
    (name) => !(name in before) && !(name in samples) && toParameter(declarations[name]).required
  )
  if (added.length === 0) return next
  const newSamples = Object.fromEntries(added.map((name) => [name, sampleValue(name, next)]))
  return { ...next, listing: { ...listing, samples: { ...samples, ...newSamples } } }
}

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
    default:
      return {}
  }
}

// `homogeneous` can't be empty, so it starts with one type
const newConstraint = (key: string) => {
  switch (key) {
    case 'length':
      return 2
    case 'homogeneous':
      return ['string']
    default:
      return {}
  }
}

const DECLARATION_TYPES: Record<string, boolean | TypeOptions> = {
  type: [SINGLE_TYPE, strings.FT_TYPE_MULTIPLE, strings.FT_TYPE_LITERAL],
  required: ['boolean'],
  default: true,
}

// `homogeneous` is drawn as chips of basic types (definitionNodes.tsx)
const CONSTRAINT_TYPES: Record<string, boolean | TypeOptions> = {
  length: ['number'],
  homogeneous: false,
  elementShape: false,
}

export const allowTypeSelection: TypeFilterFunction = ({ path, key }) => {
  switch (placeOf(path)) {
    case 'root':
    case 'declarations':
    case 'declaration':
    case 'constraints':
    case 'listing':
    case 'colors':
    case 'byParameter':
    case 'metadata':
      return false
    case 'listingField':
    case 'colorField':
      return ['string']
    case 'parameterEntry':
      return path[1] === 'parameterDescriptions' ? ['string'] : true
    case 'declarationField':
      return DECLARATION_TYPES[String(key)] ?? true
    case 'constraintField':
      return CONSTRAINT_TYPES[String(key)] ?? true
    default:
      return true
  }
}

// Each change: a parameter's entries follow it, constraints that no longer
// fit their type are dropped, then the result is held to the shape.
// Undefined where the change stands as it is.
export const checkDefinition = (
  update: Parameters<UpdateFunction>[0]
): { error: string } | { data: unknown } | undefined => {
  const next = dropUnfitConstraints(followParameters(update.fullData, update.newData, update))
  const problem = findShapeProblem(next)
  if (problem !== undefined) return { error: problem }
  return next === update.newData ? undefined : { data: next }
}

// The definition without the parameter's declaration, or its entries
export const removeParameter = <T extends DefinitionFields>(fields: T, name: string): T => {
  const { [name]: _, ...declarations } = fields.parameters ?? {}
  const next = { ...fields, parameters: declarations }
  return followParameters(fields, next, { event: 'delete', path: ['parameters', name] }) as T
}

// A renamed parameter's entries are renamed, in place, a removed parameter's
// are removed, however it was removed, and a required one added gets a
// sample
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
  const followed =
    removed.length === 0
      ? next
      : withEntries(next, (entries) =>
          Object.fromEntries(Object.entries(entries).filter(([key]) => !removed.includes(key)))
        )
  return addSamples(previous, followed)
}

// The definition with each of the listing's fields keyed by parameter
// changed, each only where it changes, so an unchanged definition stays the
// same object
const withEntries = (
  fields: Record<string, unknown>,
  change: (entries: Record<string, unknown>) => Record<string, unknown>
) => {
  const listing = recordAt(fields, 'listing')
  if (!listing) return fields
  let result = listing
  for (const field of BY_PARAMETER) {
    const entries = recordAt(listing, field)
    if (!entries) continue
    const changed = change(entries)
    if (!sameKeys(changed, entries)) result = { ...result, [field]: changed }
  }
  return result === listing ? fields : { ...fields, listing: result }
}

// The definition without the `constraints` of each declaration whose type
// isn't an array, which no value but `null` could then satisfy
const dropUnfitConstraints = (fields: unknown) => {
  if (!isRecord(fields)) return fields
  const declarations = declarationsOf(fields)
  const unfit = Object.keys(declarations).filter((name) => {
    const declaration = declarations[name]
    return (
      isRecord(declaration) &&
      'constraints' in declaration &&
      !takesConstraints(typeOf(declaration))
    )
  })
  if (unfit.length === 0) return fields
  const kept = Object.fromEntries(
    Object.entries(declarations).map(([name, declaration]) => {
      if (!unfit.includes(name) || !isRecord(declaration)) return [name, declaration]
      const { constraints: _, ...rest } = declaration
      return [name, rest]
    })
  )
  return { ...fields, parameters: kept }
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
    const constraints = declaration.constraints
    if (!isRecord(constraints)) continue
    const unknownConstraint = Object.keys(constraints).find(
      (key) => !CONSTRAINT_FIELDS.includes(key)
    )
    if (unknownConstraint !== undefined) return strings.FT_NOT_A_CONSTRAINT(unknownConstraint)
  }
  const listing = listingOf(fields)
  const unknownListingField = Object.keys(listing).find((key) => !LISTING_FIELDS.includes(key))
  if (unknownListingField !== undefined) return strings.FT_NOT_A_LISTING_FIELD(unknownListingField)
  const unknownColor = Object.keys(recordAt(listing, 'colors') ?? {}).find(
    (key) => !COLOR_FIELDS.includes(key)
  )
  if (unknownColor !== undefined) return strings.FT_NOT_A_COLOR(unknownColor)
  const undeclared = BY_PARAMETER.flatMap((field) =>
    Object.keys(recordAt(listing, field) ?? {})
  ).find((key) => !(key in declarations))
  if (undeclared !== undefined) return strings.FT_NOT_A_DECLARED_PARAMETER(undeclared)
  return undefined
}
