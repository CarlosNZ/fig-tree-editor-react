import {
  type FragmentInfo,
  type FragmentParameter,
  type Issue,
  type OperatorInfo,
  type ParameterInfo,
} from 'fig-tree-evaluator'
import { positionalLayout, singlePositionalTarget } from 'fig-tree-evaluator/format'
import { classify, rowAt, type RowKind } from './classify'
import { type DisplayData } from './displayData'
import { getStartingValue } from './getStartingValue'
import { type Path } from './paths'

// The fill-in step (design, topic 2, "The fill-in step"): the editor's one
// change to the tree it is given, run over the whole expression after every
// update and whenever one arrives from outside.
//
// - Fill: each node gains its missing required parameters, at their starting
//   values, in the node's own form: a key on a full node or named payload,
//   trailing elements on an argument list, and an argument on a static
//   fragment call. A missing parameter that an unknown key's
//   `unknown-node-key` issue suggests (`thn` for `then`) is left for the
//   "Rename" quick fix instead.
// - Tidy: each node's keys in order, `//` first, then `operator` or
//   `fragment`, the parameters (`positionalParams` first, then declared
//   order), any unknown keys as written, `fallback` and `useCache`, and
//   `vars` last. Plain objects, vars blocks and quoted content keep theirs.
//
// It removes nothing: a key that doesn't belong stays, for its diagnostic and
// quick fixes. Cleaning is `cleanNode`'s, before a structural action commits.
//
// What it leaves unchanged comes back as the same object, the whole
// expression included, so "nothing to do" is an identity check and
// json-edit-react's memo holds for untouched rows.

export interface FillContext {
  operators: readonly OperatorInfo[]
  fragments: readonly FragmentInfo[]
  displayData: DisplayData
  issues: readonly Issue[] // `validate()`'s, for the typo guard
}

export interface FillResult {
  expression: unknown
  filled: Path[] // the rows filled in, for the filled-in marker
}

const MODIFIERS = ['fallback', 'useCache', 'vars']

type FragmentKind = Extract<RowKind, { kind: 'fragment' }>

// `literal`'s one parameter, which the editor supplies since fig-tree
// registers no declaration for it (design, topic 1, "Kinds")
const LITERAL_VALUE: FragmentParameter = { type: 'any', required: true }

export const fillAndTidy = (expression: unknown, context: FillContext): FillResult => {
  const operators = new Map<string, OperatorInfo>()
  for (const operator of context.operators) operators.set(operator.name, operator)
  const fragments = new Map(context.fragments.map((fragment) => [fragment.name, fragment]))
  const classification = classify(expression, context)
  const filled: Path[] = []

  // The keys an unknown key's issue suggests, by the path of the object that
  // holds them
  const suggested = new Map<string, Set<string>>()
  for (const { code, path, suggestion } of context.issues)
    if (code === 'unknown-node-key' && suggestion !== undefined) {
      const holder = pathKey(path.slice(0, -1))
      suggested.set(holder, (suggested.get(holder) ?? new Set()).add(suggestion))
    }
  const isSuggested = (holderPath: Path, parameter: string) =>
    suggested.get(pathKey(holderPath))?.has(parameter) ?? false

  const seedsOf = (name: string) => context.displayData.operators[name]?.seeds ?? {}

  // ── The walk ──────────────────────────────────────────────────────────

  const tidy = (value: unknown, path: Path): unknown => {
    if (Array.isArray(value))
      return mapArray(value, (element, index) => tidy(element, [...path, index]))
    if (!isObject(value)) return value
    const kind = rowAt(classification, path)?.kind
    // Neither a malformed node nor a literal's content is walked
    if (kind !== undefined && 'malformed' in kind && kind.malformed !== undefined) return value
    const children = mapObject(value, (child, key) =>
      key === '//' || (kind?.kind === 'literal' && isLiteralContent(key, kind.form))
        ? child
        : tidy(child, [...path, key])
    )
    switch (kind?.kind) {
      case 'operator':
        return kind.form === 'full'
          ? fullOperator(children, path, operators.get(kind.operator ?? ''))
          : shorthandOperator(children, path, kind.name!, operators.get(kind.operator ?? ''))
      case 'fragment':
        return kind.form === 'full'
          ? fullFragment(children, path, kind, fragments.get(kind.name ?? ''))
          : shorthandFragment(children, path, kind, fragments.get(kind.name!))
      case 'literal':
        return kind.form === 'full' ? fullLiteral(children, path) : children
      default:
        return children
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────

  const fullOperator = (
    node: Record<string, unknown>,
    path: Path,
    operator: OperatorInfo | undefined
  ) => {
    if (operator === undefined) return node
    const result = fillParameters(node, path, operator.parameters, seedsOf(operator.name))
    return order(result, ['//', 'operator'], parameterOrder(operator))
  }

  const shorthandOperator = (
    node: Record<string, unknown>,
    path: Path,
    name: string,
    operator: OperatorInfo | undefined
  ) => {
    if (operator === undefined) return node
    const key = `$${name}`
    const payloadPath = [...path, key]
    const payload = node[key]
    const seeds = seedsOf(operator.name)
    let filledPayload: unknown = payload
    if (Array.isArray(payload))
      filledPayload = fillPositional(payload, payloadPath, operator, seeds)
    else if (rowAt(classification, payloadPath)?.payload === 'flattened')
      filledPayload = order(
        fillParameters(payload as Record<string, unknown>, payloadPath, operator.parameters, seeds),
        ['//'],
        parameterOrder(operator)
      )
    else filledPayload = fillSingle(payload, payloadPath, operator, seeds)
    const result = filledPayload === payload ? node : { ...node, [key]: filledPayload }
    return order(result, ['//', key], [])
  }

  const fullFragment = (
    node: Record<string, unknown>,
    path: Path,
    kind: FragmentKind,
    fragment: FragmentInfo | undefined
  ) => {
    let result = node
    const parameters = result.parameters as Record<string, unknown> | undefined
    // A call without `parameters` has no arguments, and gains the map when
    // it needs one. Dynamic arguments are checked only at runtime.
    if (fragment !== undefined && (kind.arguments === 'static' || kind.arguments === 'none')) {
      const argumentsPath = [...path, 'parameters']
      const args = order(
        fillParameters(
          parameters ?? {},
          argumentsPath,
          fragment.parameters,
          fragmentSeeds(fragment)
        ),
        ['//'],
        Object.keys(fragment.parameters)
      )
      if (parameters === undefined ? Object.keys(args).length > 0 : args !== parameters)
        result = { ...result, parameters: args }
    }
    return order(result, ['//', 'fragment', 'parameters'], [])
  }

  const shorthandFragment = (
    node: Record<string, unknown>,
    path: Path,
    kind: FragmentKind,
    fragment: FragmentInfo | undefined
  ) => {
    const key = `$${kind.name}`
    const payload = node[key] as Record<string, unknown>
    let result = node
    if (fragment !== undefined && kind.arguments === 'static') {
      const payloadPath = [...path, key]
      const args = order(
        fillParameters(payload, payloadPath, fragment.parameters, fragmentSeeds(fragment)),
        ['//'],
        Object.keys(fragment.parameters)
      )
      if (args !== payload) result = { ...node, [key]: args }
    }
    return order(result, ['//', key], [])
  }

  const fullLiteral = (node: Record<string, unknown>, path: Path) => {
    const result = fillParameters(node, path, { value: LITERAL_VALUE }, seedsOf('literal'))
    return order(result, ['//', 'operator', 'value'], [])
  }

  // ── Filling ───────────────────────────────────────────────────────────

  // Each missing required parameter, into the object at `holderPath`
  const fillParameters = (
    holder: Record<string, unknown>,
    holderPath: Path,
    declarations: Record<string, ParameterInfo | FragmentParameter>,
    seeds: Record<string, unknown>
  ) => {
    let result = holder
    for (const [parameter, declaration] of Object.entries(declarations)) {
      if (!declaration.required || parameter in holder || isSuggested(holderPath, parameter))
        continue
      if (result === holder) result = { ...holder }
      result[parameter] = getStartingValue(parameter, declaration, seeds)
      filled.push([...holderPath, parameter])
    }
    return result
  }

  // Supplied positional arguments are always an unbroken prefix, so the
  // missing required ones are appended, with every position before the last
  const fillPositional = (
    payload: unknown[],
    payloadPath: Path,
    operator: OperatorInfo,
    seeds: Record<string, unknown>
  ): unknown[] => {
    if (positionalLayout(operator, payload.length) === null) return payload
    const leading = leadingPositions(operator)
    let last = leading.length - 1
    while (last >= 0 && !operator.parameters[leading[last]]?.required) last--
    if (last < payload.length) return payload
    const appended = leading.slice(payload.length, last + 1).map((name, offset) => {
      filled.push([...payloadPath, payload.length + offset])
      return getStartingValue(name, operator.parameters[name], seeds)
    })
    return [...payload, ...appended]
  }

  // A single value binds the first position. Where later positions are
  // required too, it becomes an argument list, still in positional form.
  const fillSingle = (
    payload: unknown,
    payloadPath: Path,
    operator: OperatorInfo,
    seeds: Record<string, unknown>
  ) => {
    const leading = leadingPositions(operator)
    if (singlePositionalTarget(operator) !== leading[0]) return payload
    const filledList = fillPositional([payload], payloadPath, operator, seeds)
    return filledList.length === 1 ? payload : filledList
  }

  const expressionOut = tidy(expression, [])
  return { expression: expressionOut, filled }
}

// ── Key order ─────────────────────────────────────────────────────────────

// `head` first, then `parameters` in order, then any other keys as written,
// then the modifiers, with `vars` last. The same object where nothing moves.
const order = (node: Record<string, unknown>, head: string[], parameters: string[]) => {
  const keys = Object.keys(node)
  const placed = new Set([...head, ...parameters, ...MODIFIERS])
  const sorted = [
    ...head.filter((key) => key in node),
    ...parameters.filter((key) => key in node && !head.includes(key)),
    ...keys.filter((key) => !placed.has(key)),
    ...MODIFIERS.filter((key) => key in node && !head.includes(key)),
  ]
  if (sorted.every((key, index) => keys[index] === key)) return node
  return Object.fromEntries(sorted.map((key) => [key, node[key]]))
}

// `positionalParams` first, then the rest in declared order
export const parameterOrder = (operator: OperatorInfo) => {
  const positional = (operator.positionalParams ?? []).map((name) => name.replace(/^\.\.\./, ''))
  return [
    ...positional,
    ...Object.keys(operator.parameters).filter((name) => !positional.includes(name)),
  ]
}

// The positions before any rest parameter
const leadingPositions = (operator: OperatorInfo) =>
  (operator.positionalParams ?? []).filter((name) => !name.startsWith('...'))

// ── Helpers ───────────────────────────────────────────────────────────────

const fragmentSeeds = (fragment: FragmentInfo) => {
  const seeds = fragment.metadata?.seeds
  return isObject(seeds) ? seeds : {}
}

const isLiteralContent = (key: string, form: 'full' | 'shorthand') =>
  form === 'full' ? key === 'value' : key === '$literal'

const mapArray = (array: unknown[], map: (element: unknown, index: number) => unknown) => {
  const mapped = array.map(map)
  return mapped.every((element, index) => element === array[index]) ? array : mapped
}

const mapObject = (
  object: Record<string, unknown>,
  map: (child: unknown, key: string) => unknown
) => {
  let result = object
  for (const key of Object.keys(object)) {
    const child = map(object[key], key)
    if (child === object[key]) continue
    if (result === object) result = { ...object }
    result[key] = child
  }
  return result
}

const pathKey = (path: Path) => JSON.stringify(path)

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)
