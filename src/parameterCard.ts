import {
  type ExpectedType,
  type FragmentParameter,
  type OperatorInfo,
  type ParameterInfo,
} from 'fig-tree-evaluator'
import { cacheStatus, type CacheContext } from './caching'
import { type Row, type RowKind } from './classify'
import { describeType } from './describeType'
import { type NullOutcomes, type OperatorDisplay } from './displayData'
import { type Path } from './paths'
import { strings } from './strings'

// What a parameter's hover card says (design, topic 4, "Parameter metadata"),
// worded by the editor from the metadata, so a host's operators get the same
// cards: a first line with the name, whether it's required and what it
// takes, its description, then a line for each of these that applies: its
// elements' constraints, its default, when it's evaluated, what null does
// there, and what it stands in for. Modifiers and the vars block get their
// own description. An operator's parameter takes its description from the
// operator's display data, and a fragment's argument from its declaration.
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
  display?: OperatorDisplay // the owner's, for its parameters' descriptions
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
    operator === undefined
      ? (declaration as FragmentParameter).description
      : display?.parameterDescriptions[name],
    elementsLine(declaration),
    defaultLine(declaration),
    evaluatedLine(declaration, as),
    nullLine(
      name,
      declaration,
      operator,
      display?.nullOutcomes[name] ?? argumentOutcomes(declaration)
    ),
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

// What a null does, at the parameter and at one of its elements, as the
// catalog's `nullOutcome` and `elementNullOutcome` report it. A null that is
// only a value goes unsaid, except at a truthiness position, where it counts
// as false. A replacement's rescue is added where it applies: at a parameter
// declaring an element policy it replaces null elements only, so it is said
// of a null element that makes the result null, and elsewhere of the
// parameter's own null.
const nullLine = (
  name: string,
  declaration: Declaration,
  operator: OperatorInfo | undefined,
  outcomes: NullOutcomes
) => {
  const replacer = Object.entries(operator?.parameters ?? {}).find(([, parameter]) =>
    parameter.replacesNullAt?.includes(name)
  )?.[0]
  const unless = (phrase: string) =>
    replacer === undefined ? phrase : strings.FT_CARD_UNLESS(phrase, code(replacer))
  const { nullOutcome, elementNullOutcome } = outcomes
  const truthiness = 'truthiness' in declaration && declaration.truthiness
  const rescuesElements =
    'elementNullPolicy' in declaration && declaration.elementNullPolicy !== undefined

  const elements = {
    propagate: unless(strings.FT_CARD_NULL_ELEMENT_PROPAGATES),
    value: truthiness ? strings.FT_CARD_NULL_ELEMENT_FALSE : strings.FT_CARD_NULL_ELEMENTS_ACCEPTED,
    error: strings.FT_CARD_NULL_ELEMENT_ERROR,
  }
  const whole = (): string | undefined => {
    if (typeof nullOutcome === 'object') return conditional(nullOutcome)
    const rescued = (phrase: string) => (rescuesElements ? phrase : unless(phrase))
    switch (nullOutcome) {
      case 'propagate':
        return rescued(strings.FT_CARD_NULL_PROPAGATES)
      case 'error':
        return rescued(strings.FT_CARD_NULL_ERROR)
      case 'unset':
        return hasDefault(declaration)
          ? strings.FT_CARD_NULL_UNSET
          : strings.FT_CARD_NULL_UNSET_ONLY
      case 'value':
        return truthiness ? strings.FT_CARD_NULL_FALSE : undefined
      case 'none':
        return undefined
    }
  }

  const parts = [
    whole(),
    elementNullOutcome === undefined ? undefined : elements[elementNullOutcome],
  ].filter(isString)
  return parts.length === 0 ? undefined : strings.FT_CARD_IF_NULL(parts.join('; '))
}

// A fragment's argument, which the catalog doesn't cover: its null is a value
// where its type names null, else it unsets an optional argument and is an
// error at a required one
const argumentOutcomes = (declaration: Declaration): NullOutcomes => ({
  nullOutcome: takesNull(declaration.type) ? 'value' : declaration.required ? 'error' : 'unset',
})

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
