import {
  type ConditionalNullBehavior,
  type ExpectedType,
  type FragmentParameter,
  type OperatorInfo,
  type ParameterInfo,
} from 'fig-tree-evaluator'
import { cacheStatus, type CacheContext } from './caching'
import { type Row, type RowKind } from './classify'
import { describeType } from './describeType'
import { type OperatorDisplay } from './displayData'
import { type Path } from './paths'
import { strings } from './strings'

// What a parameter's hover card says (design, topic 4, "Parameter metadata"),
// worded by the editor from the metadata, so a host's operators get the same
// cards: a first line with the name, whether it's required and what it
// takes, its description, then a line for each of these that applies: its
// elements' constraints, its default, when it's evaluated, what null does
// there, and what it stands in for. Modifiers and the vars block get their
// own description. A parameter takes its description from its owner's
// display data, an operator's or a fragment's.
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
  operator: OperatorInfo | undefined, // the owner's, for what replaces a null
  display?: OperatorDisplay // the owner's, an operator's or a fragment's, for the descriptions
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
    display?.parameterDescriptions[name],
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
  if (!('evaluationMode' in declaration)) return undefined
  switch (declaration.evaluationMode) {
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
      return strings.FT_CARD_EVALUATED(strings.FT_CARD_EVALUATION[declaration.evaluationMode])
  }
}

// What a null does, at the parameter and at one of its elements, as its
// `nullBehavior` and `elementNullBehavior` report it. A null that is only
// accepted goes unsaid, except at a truthiness position, where it counts as
// false, and so does a null at a replacement, which replaces nothing. The
// elements are said only where the type takes nothing but arrays and
// objects. A replacement's rescue is added where it applies: at a parameter
// declaring an element policy it replaces null elements only, so it is said
// of a null element that makes the result null, and elsewhere of the
// parameter's own null.
const nullLine = (name: string, declaration: Declaration, operator: OperatorInfo | undefined) => {
  if ('replacesNullAt' in declaration && declaration.replacesNullAt?.length) return undefined
  const replacer = Object.entries(operator?.parameters ?? {}).find(([, parameter]) =>
    parameter.replacesNullAt?.includes(name)
  )?.[0]
  const unless = (phrase: string) =>
    replacer === undefined ? phrase : strings.FT_CARD_UNLESS(phrase, code(replacer))
  const { nullBehavior, type } = declaration
  const elementNullBehavior = takesOnlyContainers(type)
    ? declaration.elementNullBehavior
    : undefined
  const truthiness = 'truthiness' in declaration && declaration.truthiness
  const rescuesElements =
    'elementNullPolicy' in declaration && declaration.elementNullPolicy !== undefined

  const elements = {
    propagate: unless(strings.FT_CARD_NULL_ELEMENT_PROPAGATES),
    accept: truthiness
      ? strings.FT_CARD_NULL_ELEMENT_FALSE
      : strings.FT_CARD_NULL_ELEMENTS_ACCEPTED,
    error: strings.FT_CARD_NULL_ELEMENT_ERROR,
  }
  const whole = (): string | undefined => {
    if (typeof nullBehavior === 'object') return conditional(nullBehavior)
    const rescued = (phrase: string) => (rescuesElements ? phrase : unless(phrase))
    switch (nullBehavior) {
      case 'propagate':
        return rescued(strings.FT_CARD_NULL_PROPAGATES)
      case 'error':
        return rescued(strings.FT_CARD_NULL_ERROR)
      case 'omit':
        return hasDefault(declaration)
          ? strings.FT_CARD_NULL_OMITTED
          : strings.FT_CARD_NULL_OMITTED_ONLY
      case 'accept':
        return truthiness ? strings.FT_CARD_NULL_FALSE : undefined
    }
  }

  const parts = [
    whole(),
    elementNullBehavior === undefined ? undefined : elements[elementNullBehavior],
  ].filter(isString)
  return parts.length === 0 ? undefined : strings.FT_CARD_IF_NULL(parts.join('; '))
}

// "if `to` is 'boolean', null is used as a value; otherwise the result is
// null": the cases that differ from the commonest behaviour, then the rest
const conditional = ({ selector, table }: ConditionalNullBehavior) => {
  const propagating = table.filter(({ behavior }) => behavior === 'propagate')
  const [common, other] =
    propagating.length * 2 >= table.length
      ? (['propagate', 'accept'] as const)
      : (['accept', 'propagate'] as const)
  const cases = table
    .filter(({ behavior }) => behavior === other)
    .map(({ value }) => formatValue(value))
  return strings.FT_CARD_NULL_CONDITIONAL(
    code(selector),
    orList(cases),
    behaviorWords[other],
    behaviorWords[common]
  )
}

const behaviorWords = {
  propagate: strings.FT_CARD_NULL_PROPAGATES,
  accept: strings.FT_CARD_NULL_VALUE,
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

const takesOnlyContainers = (type: ExpectedType) =>
  [type].flat().every((member) => member === 'array' || member === 'object')

const hasDefault = (declaration: Declaration) =>
  declaration.default !== undefined ||
  ('hostDefault' in declaration && declaration.hostDefault !== undefined)

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
