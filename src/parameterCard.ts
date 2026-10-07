import {
  type ExpectedType,
  type FragmentParameter,
  type OperatorInfo,
  type ParameterInfo,
} from 'fig-tree-evaluator'
import { cacheStatus, type CacheContext } from './caching'
import { type Row, type RowKind } from './classify'
import { describeType } from './describeType'
import { type Path } from './paths'
import { strings } from './strings'

// What a parameter's hover card says (design, topic 4, "Parameter metadata"),
// worded by the editor from the metadata, so a host's operators get the same
// cards: a first line with the name, whether it's required and what it
// takes, the declaration's description, then a line for each of these that
// applies: its elements' constraints, its default, when it's evaluated, what
// null does there, and what it stands in for. Modifiers and the vars block
// get their own description.
//
// Names in a line are in backticks, which the card shows as code.

type Declaration = ParameterInfo | FragmentParameter

const MODIFIERS: Record<string, string> = {
  fallback: strings.FT_MODIFIER_FALLBACK,
  noCache: strings.FT_MODIFIER_NO_CACHE,
}

// Whether a row has a card: a declared parameter or fragment argument, a
// modifier, or the vars block
export const hasCard = (row: Row | undefined) => {
  if (row?.kind?.kind === 'vars') return true
  const slot = row?.slot
  return slot?.role === 'modifier' || (slot?.role === 'parameter' && slot.declaration !== undefined)
}

// Null where the row has no card
export const parameterCard = (
  row: Row | undefined,
  operator: OperatorInfo | undefined // the owner's, for what replaces a null
): string[] | null => {
  if (row?.kind?.kind === 'vars') return [title('vars'), strings.FT_MODIFIER_VARS]
  const slot = row?.slot
  if (slot === undefined || slot.parameter === undefined) return null
  const name = slot.parameter
  if (slot.role === 'modifier')
    return [title(name, false, slot.admits), MODIFIERS[name]].filter(isString)
  if (slot.role !== 'parameter' || slot.declaration === undefined) return null

  const declaration = slot.declaration as Declaration
  const iterator = [...(row?.scope ?? [])]
    .reverse()
    .find((entry) => entry.kind === 'iterator' && pathsEqual(entry.path, slot.ownerPath))
  const as = iterator?.kind === 'iterator' ? iterator.as : undefined
  return [
    title(name, declaration.required, slot.admits),
    declaration.description,
    elementsLine(declaration),
    defaultLine(declaration),
    evaluatedLine(declaration, as),
    nullLine(name, declaration, operator),
    replacementLine(declaration),
  ].filter(isString)
}

const title = (name: string, required?: boolean, admits?: ExpectedType) =>
  [
    `\`${name}\``,
    required === undefined
      ? undefined
      : required
        ? strings.FT_CARD_REQUIRED
        : strings.FT_CARD_OPTIONAL,
    admits === undefined ? undefined : strings.FT_CARD_TAKES(describeType(admits)),
  ]
    .filter(isString)
    .join(' · ')

// ── The lines ───────────────────────────────────────────────────────────────

const elementsLine = ({ constraints }: Declaration) => {
  if (!constraints) return undefined
  const { length, homogeneous, elementShape } = constraints
  const parts = [
    length === undefined ? undefined : strings.FT_CARD_EXACTLY(length),
    homogeneous && orList(homogeneous.map((type) => strings.FT_CARD_ALL(strings.FT_TYPES[type]))),
    elementShape && strings.FT_CARD_SHAPE(andList(Object.keys(elementShape).map(code))),
  ].filter(isString)
  return parts.length === 0 ? undefined : strings.FT_CARD_ELEMENTS(parts.join(', '))
}

// The effective default, and FigTree's own where the host overrides it
const defaultLine = (declaration: Declaration) => {
  const own = declaration.default
  const host = 'hostDefault' in declaration ? declaration.hostDefault : undefined
  if (host !== undefined)
    return strings.FT_CARD_DEFAULT_HERE(
      formatValue(host),
      own === undefined ? undefined : formatValue(own)
    )
  return own === undefined ? undefined : strings.FT_CARD_DEFAULT(formatValue(own))
}

const evaluatedLine = (declaration: Declaration, as: string | undefined) => {
  if (!('evaluation' in declaration)) return undefined
  switch (declaration.evaluation) {
    case 'eager':
      return undefined
    case 'perElement': {
      const element = as ?? 'element'
      const index = as === undefined ? 'index' : `${as}Index`
      return strings.FT_CARD_EVALUATED(
        strings.FT_CARD_PER_ELEMENT(
          code(declaration.over ?? ''),
          code(`$${element}`),
          code(`$${index}`)
        )
      )
    }
    default:
      return strings.FT_CARD_EVALUATED(strings.FT_CARD_EVALUATION[declaration.evaluation])
  }
}

// In order: a truthiness position's null counts as false; a conditional
// policy depends on another parameter; an optional parameter that can't be
// null is unset by it; an eager parameter that propagates gives null; one
// that takes null takes it as a value; and a required one that can't be
// null is an error. A replacement's rescue is added where it applies.
const nullLine = (name: string, declaration: Declaration, operator: OperatorInfo | undefined) => {
  const replacer = Object.entries(operator?.parameters ?? {}).find(([, parameter]) =>
    parameter.replacesNullAt?.includes(name)
  )?.[0]
  const unless = (phrase: string) =>
    replacer === undefined ? phrase : strings.FT_CARD_UNLESS(phrase, code(replacer))

  const isArray = declaration.type === 'array'
  const elementPolicy =
    'elementNullPolicy' in declaration ? declaration.elementNullPolicy : undefined
  const elements =
    elementPolicy === 'propagate'
      ? unless(strings.FT_CARD_NULL_ELEMENT_PROPAGATES)
      : elementPolicy === 'value'
        ? strings.FT_CARD_NULL_ELEMENTS_ACCEPTED
        : undefined

  const whole = (): string | undefined => {
    if ('truthiness' in declaration && declaration.truthiness)
      return isArray ? strings.FT_CARD_NULL_ELEMENT_FALSE : strings.FT_CARD_NULL_FALSE
    const policy = 'nullPolicy' in declaration ? declaration.nullPolicy : undefined
    if (typeof policy === 'object') return conditional(policy)
    if (!declaration.required && !takesNull(declaration.type))
      return hasDefault(declaration) ? strings.FT_CARD_NULL_UNSET : strings.FT_CARD_NULL_UNSET_ONLY
    const eager = 'evaluation' in declaration && declaration.evaluation === 'eager'
    if (eager && policy === 'propagate')
      return elements === undefined
        ? unless(strings.FT_CARD_NULL_PROPAGATES)
        : strings.FT_CARD_NULL_PROPAGATES
    if (takesNull(declaration.type)) return undefined
    return declaration.required ? strings.FT_CARD_NULL_ERROR : undefined
  }

  const parts = [whole(), elements].filter(isString)
  return parts.length === 0 ? undefined : strings.FT_CARD_IF_NULL(parts.join('; '))
}

// "if `to` is 'boolean', null is used as a value; otherwise the result is
// null": the cases that differ from the commonest policy, then the rest
type Conditional = { selector: string; table: { value: unknown; policy: 'propagate' | 'value' }[] }
const conditional = ({ selector, table }: Conditional) => {
  const propagating = table.filter(({ policy }) => policy === 'propagate')
  const [common, other] =
    propagating.length * 2 >= table.length ? ['propagate', 'value'] : ['value', 'propagate']
  const cases = table
    .filter(({ policy }) => policy === other)
    .map(({ value }) => formatValue(value))
  return strings.FT_CARD_NULL_CONDITIONAL(
    code(selector),
    orList(cases),
    policyWords[other as 'propagate' | 'value'],
    policyWords[common as 'propagate' | 'value']
  )
}

const policyWords = {
  propagate: strings.FT_CARD_NULL_PROPAGATES,
  value: strings.FT_CARD_NULL_VALUE,
}

const replacementLine = (declaration: Declaration) => {
  const targets = 'replacesNullAt' in declaration ? declaration.replacesNullAt : undefined
  if (!targets?.length) return undefined
  return strings.FT_CARD_REPLACES(orList(targets.map(code)))
}

// ── The operator's own card ─────────────────────────────────────────────────

// What the host sets on every node of this operator that doesn't set its
// own (topic 4): a fallback, that it never caches, and parameters' defaults
export const operatorDefaultsLine = (operator: OperatorInfo, node: Record<string, unknown>) => {
  const set: string[] = []
  const add = (key: string, value: unknown) => {
    if (value !== undefined && !(key in node)) set.push(code(`${key}: ${formatValue(value)}`))
  }
  add('fallback', operator.hostFallback)
  add('noCache', operator.hostNoCache)
  for (const [key, parameter] of Object.entries(operator.parameters))
    add(key, parameter.hostDefault)
  if (set.length === 0) return undefined
  return strings.FT_CARD_HOST_SETS(andList(set), code(operator.name))
}

// On a node that caches, whether its cache is in force, since a `noCache`
// several levels up turns it off unseen (topic 4, "Caching")
export const cacheLine = (path: Path, kind: RowKind | undefined, context: CacheContext) => {
  const status = cacheStatus(path, kind, context)
  if (status === undefined) return undefined
  return {
    detail: status === 'active' ? strings.FT_CARD_CACHE_ACTIVE : strings.FT_CARD_CACHE_DISABLED,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const hasDefault = (declaration: Declaration) =>
  declaration.default !== undefined ||
  ('hostDefault' in declaration && declaration.hostDefault !== undefined)

const takesNull = (type: ExpectedType) =>
  type === 'any' ||
  type === 'null' ||
  (Array.isArray(type) && type.some((t) => t === 'any' || t === 'null'))

// A value as it would be written. The one symbol a default can be is
// `get.from`'s, the evaluation data, which `from: '$data'` writes.
const formatValue = (value: unknown): string => {
  if (typeof value === 'symbol') return formatValue('$data')
  if (typeof value === 'string') return `'${value}'`
  return JSON.stringify(value) ?? String(value)
}

const code = (text: string) => `\`${text}\``

const orList = (items: string[]) => list(items, strings.FT_LIST_OR)
const andList = (items: string[]) => list(items, strings.FT_LIST_AND)
const list = (items: string[], last: string) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${last} ${items.at(-1)}`

const pathsEqual = (a: readonly unknown[], b: readonly unknown[] | null) =>
  b !== null && a.length === b.length && a.every((segment, index) => segment === b[index])

const isString = (value: unknown): value is string => typeof value === 'string' && value !== ''
