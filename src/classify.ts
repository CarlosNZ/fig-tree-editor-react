import {
  type FragmentInfo,
  type FragmentParameter,
  type OperatorInfo,
  type ParameterInfo,
  type ReferenceNamespace,
} from 'fig-tree-evaluator'
import {
  classifyObject,
  positionalLayout,
  recognizeReference,
  singlePositionalTarget,
} from 'fig-tree-evaluator/format'
import { toPathString } from 'json-edit-react'
import { type Path } from './paths'
import {
  argumentsSlot,
  dataSlot,
  elementSlot,
  entrySlot,
  fieldSlot,
  modifierSlot,
  parameterSlot,
  rootSlot,
  takesElements,
  varSlot,
  type Slot,
} from './slots'

// The classification walk (design, topic 1, "Classification"): the whole
// tree, top-down, once per update, producing a map from each row's path to
// what the editor needs to know about it. Kind depends on position, not only
// on value (`vars: { operator: 'x' }` declares a var), so it is worked out
// here once rather than per row by every consumer.
//
// fig-tree supplies the reading of each object and string (`classifyObject`,
// `recognizeReference`, `positionalLayout`, `singlePositionalTarget`); the
// position rules around them are the editor's, after `./format`'s walk:
// `literal` content and `//` values are not walked, a `vars` block is a map
// of names, a fragment call's `parameters` is a map or a node, and an `as`
// name reads as a reference only inside its iterator's per-element
// parameter, where the walk passes it to `recognizeReference`.
//
// Context flows down, never up, apart from whether a plain container holds a
// node or reference. The walk classifies but does not validate: `validate()`
// reports what is wrong, so an unknown operator's parameters are walked as
// undeclared, where the compiler stops.

type Form = 'full' | 'shorthand'

export type RowKind =
  | {
      kind: 'operator'
      form: Form
      name: string | null // as written; null when not a string
      operator: string | null // the canonical name, when registered
      malformed?: string // `classifyObject`'s message
    }
  | {
      kind: 'fragment'
      form: Form
      name: string | null
      registered: boolean
      arguments: 'none' | 'static' | 'dynamic' | 'invalid'
      malformed?: string
    }
  | { kind: 'literal'; form: Form }
  | {
      kind: 'reference'
      namespace: ReferenceNamespace
      binding?: string // the name an `as` gives the element or index
      invalid?: true // reference-shaped, but `recognizeReference` rejects it
    }
  | { kind: 'container' } // plain data holding a node or reference
  | { kind: 'comment' }
  | { kind: 'vars' }

// The scopes enclosing a row, outermost first: each `vars` block (by the
// block's path) and each iterator whose per-element parameter the row is in
// (by the node's path)
export type ScopeEntry =
  { kind: 'vars'; path: Path } | { kind: 'iterator'; path: Path; as?: string }

export interface Row {
  kind?: RowKind
  // A shorthand's `$name` row, or a fragment call's static `parameters` row:
  // flattened (the row itself disappears beneath the node's header) or
  // unlabelled (the row stays, without its key)
  payload?: 'flattened' | 'unlabelled'
  filtered?: true // the `operator` or `fragment` row, which the header shows
  slot?: Slot // on every evaluated row
  scope?: readonly ScopeEntry[] // on every row with a slot
}

// Keyed by json-edit-react's `toPathString`, the form a definition's
// `condition` can look a row up by. A row with no entry is plain data.
export type Classification = ReadonlyMap<string, Row>

export const rowAt = (classification: Classification, path: Path) =>
  classification.get(toPathString(path))

interface Registry {
  operators: readonly OperatorInfo[]
  fragments: readonly FragmentInfo[]
}

interface Context {
  scope: readonly ScopeEntry[]
  owner: Path | null // the nearest enclosing node, for plain data's slots
}

export const classify = (expression: unknown, registry: Registry): Classification => {
  const operators = new Map<string, OperatorInfo>()
  for (const operator of registry.operators) {
    operators.set(operator.name, operator)
    if (operator.alias !== undefined) operators.set(operator.alias, operator)
  }
  const fragments = new Map(registry.fragments.map((fragment) => [fragment.name, fragment]))
  // What a `$name` key invokes, as the compiler reads it: `literal`, a
  // fragment, then an operator or alias
  const recognizes = (name: string) =>
    name === 'literal' || fragments.has(name) || operators.has(name)
  const isNode = (value: Record<string, unknown>) =>
    classifyObject(value, recognizes).kind !== 'plain'

  const rows = new Map<string, Row>()
  const row = (path: Path) => {
    const key = toPathString(path)
    let found = rows.get(key)
    if (found === undefined) rows.set(key, (found = {}))
    return found
  }
  const mark = (path: Path, kind: RowKind) => {
    row(path).kind = kind
  }

  // ── Values ────────────────────────────────────────────────────────────

  // Record a value's slot and classify it. True when the value is, or holds,
  // a node or reference.
  const visit = (value: unknown, path: Path, slot: Slot, context: Context): boolean => {
    Object.assign(row(path), { slot, scope: context.scope })
    if (slot.literalOnly) return false
    if (typeof value === 'string') return string(value, path, context)
    if (Array.isArray(value)) return array(value, path, slot, context)
    if (isObject(value)) return object(value, path, slot, context)
    return false
  }

  const string = (value: string, path: Path, context: Context) => {
    const recognition = recognizeReference(value, { bindings: bindings(context.scope) })
    if (recognition.kind === 'reference') {
      const { namespace, binding } = recognition
      mark(path, { kind: 'reference', namespace, ...(binding !== undefined && { binding }) })
      return true
    }
    if (recognition.kind === 'invalid') {
      mark(path, { kind: 'reference', namespace: recognition.namespace, invalid: true })
      return true
    }
    return false
  }

  const array = (value: unknown[], path: Path, slot: Slot, context: Context) => {
    const elements = slot.role === 'parameter' && takesElements(slot.declaration)
    const live = value
      .map((element, index) => {
        const elementPath = [...path, index]
        return visit(
          element,
          elementPath,
          elements
            ? elementSlot(elementPath, slot.ownerPath!, slot.parameter!, parameterOf(slot))
            : dataSlot(elementPath, context.owner),
          context
        )
      })
      .includes(true)
    if (live) mark(path, { kind: 'container' })
    return live
  }

  const object = (value: Record<string, unknown>, path: Path, slot: Slot, context: Context) => {
    const classified = classifyObject(value, recognizes)
    switch (classified.kind) {
      case 'malformed':
        mark(path, malformed(value, classified.message))
        return true
      case 'operator':
        operatorNode(value, path, context)
        return true
      case 'fragment':
        fragmentNode(value, path, context)
        return true
      case 'shorthand':
        shorthandNode(value, classified.key, path, context)
        return true
      case 'plain': {
        // An element of `buildObject.entries` is an object of fields
        const shape =
          slot.role === 'element' ? slot.declaration?.constraints?.elementShape : undefined
        return plainObject(value, path, context, (key, childPath) =>
          shape?.[key] !== undefined
            ? fieldSlot(childPath, slot.ownerPath!, key, shape[key])
            : dataSlot(childPath, context.owner)
        )
      }
    }
  }

  // A plain object's values are evaluated, `//` is a comment, and `vars` is
  // a block whose scope covers the object
  const plainObject = (
    value: Record<string, unknown>,
    path: Path,
    context: Context,
    slotAt: (key: string, path: Path) => Slot
  ) => {
    const inner = withVars(value, path, context)
    let live = false
    for (const key in value) {
      const childPath = [...path, key]
      if (key === '//') mark(childPath, { kind: 'comment' })
      else if (key === 'vars') varsBlock(value.vars, childPath, path, inner)
      else live = visit(value[key], childPath, slotAt(key, childPath), inner) || live
    }
    if (live) mark(path, { kind: 'container' })
    return live
  }

  // A block's names are never classified, so a `$name` key in it is a var
  // name. Its values see the block itself, as fig-tree's vars are lazy.
  const varsBlock = (block: unknown, path: Path, ownerPath: Path, context: Context) => {
    if (!isObject(block)) return
    mark(path, { kind: 'vars' })
    for (const name in block) {
      const varPath = [...path, name]
      if (name === '//') mark(varPath, { kind: 'comment' })
      else visit(block[name], varPath, varSlot(varPath, ownerPath), context)
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────

  // The context a node's own rows are in: owned by the node, and in the
  // scope of its `vars` block, which covers its parameters, `fallback` and
  // the block's own values
  const nodeContext = (value: Record<string, unknown>, path: Path, context: Context) =>
    withVars(value, path, { ...context, owner: path })

  // `fallback`, `useCache` and `vars`, on any node. False for any other key.
  const modifier = (key: string, value: unknown, path: Path, nodePath: Path, inner: Context) => {
    if (key === 'fallback' || key === 'useCache')
      visit(value, path, modifierSlot(path, nodePath, key), inner)
    else if (key === 'vars') varsBlock(value, path, nodePath, inner)
    else return false
    return true
  }

  const parameter = (
    operator: OperatorInfo | undefined,
    name: string,
    value: unknown,
    path: Path,
    nodePath: Path,
    inner: Context,
    as: string | undefined
  ) => {
    const declaration = operator?.parameters[name]
    const slot = parameterSlot(path, nodePath, name, declaration)
    const context =
      declaration?.evaluation === 'perElement'
        ? { ...inner, scope: [...inner.scope, { kind: 'iterator' as const, path: nodePath, as }] }
        : inner
    // A `lazyEntries` map's values are each a slot, and its keys are data
    if (declaration?.evaluation === 'lazyEntries' && isObject(value) && !isNode(value)) {
      Object.assign(row(path), { slot, scope: context.scope })
      plainObject(value, path, context, (_, entryPath) =>
        entrySlot(entryPath, nodePath, name, declaration)
      )
      return
    }
    visit(value, path, slot, context)
  }

  const operatorNode = (value: Record<string, unknown>, path: Path, context: Context) => {
    row([...path, 'operator']).filtered = true
    const name = typeof value.operator === 'string' ? value.operator : null
    if (name === 'literal') {
      mark(path, { kind: 'literal', form: 'full' })
      if ('//' in value) mark([...path, '//'], { kind: 'comment' })
      return
    }
    const operator = name === null ? undefined : operators.get(name)
    mark(path, { kind: 'operator', form: 'full', name, operator: operator?.name ?? null })
    const inner = nodeContext(value, path, context)
    const as = asName(operator, value)
    for (const key in value) {
      const keyPath = [...path, key]
      if (key === 'operator') continue
      if (key === '//') mark(keyPath, { kind: 'comment' })
      else if (!modifier(key, value[key], keyPath, path, inner))
        parameter(operator, key, value[key], keyPath, path, inner, as)
    }
  }

  const shorthandNode = (
    value: Record<string, unknown>,
    key: string,
    path: Path,
    context: Context
  ) => {
    const name = key.slice(1)
    const payloadPath = [...path, key]
    if (name === 'literal') {
      mark(path, { kind: 'literal', form: 'shorthand' })
      row(payloadPath).payload = 'unlabelled'
      if ('//' in value) mark([...path, '//'], { kind: 'comment' })
      return
    }
    const fragment = fragments.get(name)
    const operator = operators.get(name)
    const inner = nodeContext(value, path, context)
    // Siblings other than the modifiers are `validate()`'s to report
    for (const sibling in value) {
      const siblingPath = [...path, sibling]
      if (sibling === key) continue
      if (sibling === '//') mark(siblingPath, { kind: 'comment' })
      else if (!modifier(sibling, value[sibling], siblingPath, path, inner))
        visit(value[sibling], siblingPath, dataSlot(siblingPath, path), inner)
    }
    const payload = value[key]
    if (fragment !== undefined) {
      mark(path, {
        kind: 'fragment',
        form: 'shorthand',
        name,
        registered: true,
        arguments: fragmentArguments(payload, payloadPath, path, fragment, inner, 'shorthand'),
      })
      return
    }
    // A recognised name that is not a fragment is an operator or alias
    mark(path, { kind: 'operator', form: 'shorthand', name, operator: operator!.name })
    if (Array.isArray(payload)) {
      row(payloadPath).payload = 'unlabelled'
      positional(payload, payloadPath, path, operator!, inner)
    } else if (isObject(payload) && !isNode(payload)) {
      row(payloadPath).payload = 'flattened'
      const as = asName(operator, payload)
      for (const param in payload) {
        const paramPath = [...payloadPath, param]
        if (param === '//') mark(paramPath, { kind: 'comment' })
        else parameter(operator, param, payload[param], paramPath, path, inner, as)
      }
    } else {
      // A single value binds the first position, or the whole rest parameter
      row(payloadPath).payload = 'unlabelled'
      const target = singlePositionalTarget(operator!)
      if (target === null) visit(payload, payloadPath, dataSlot(payloadPath, path), inner)
      else parameter(operator, target, payload, payloadPath, path, inner, undefined)
    }
  }

  // An argument array binds its leading positions to parameters and the rest
  // to elements of the rest parameter. An arity error leaves them plain data.
  const positional = (
    payload: unknown[],
    path: Path,
    nodePath: Path,
    operator: OperatorInfo,
    inner: Context
  ) => {
    const layout = positionalLayout(operator, payload.length)
    const rest = operator.restParam
    payload.forEach((element, index) => {
      const elementPath = [...path, index]
      if (layout !== null && index < layout.bound)
        parameter(
          operator,
          operator.positionalParams![index],
          element,
          elementPath,
          nodePath,
          inner,
          undefined
        )
      else if (layout?.restAt != null && rest !== null)
        visit(
          element,
          elementPath,
          elementSlot(elementPath, nodePath, rest, operator.parameters[rest]),
          inner
        )
      else visit(element, elementPath, dataSlot(elementPath, nodePath), inner)
    })
  }

  const fragmentNode = (value: Record<string, unknown>, path: Path, context: Context) => {
    row([...path, 'fragment']).filtered = true
    const name = typeof value.fragment === 'string' ? value.fragment : null
    const fragment = name === null ? undefined : fragments.get(name)
    const inner = nodeContext(value, path, context)
    let args: 'none' | 'static' | 'dynamic' | 'invalid' = 'none'
    for (const key in value) {
      const keyPath = [...path, key]
      if (key === 'fragment') continue
      if (key === '//') mark(keyPath, { kind: 'comment' })
      else if (key === 'parameters')
        args = fragmentArguments(value[key], keyPath, path, fragment, inner, 'full')
      else if (!modifier(key, value[key], keyPath, path, inner))
        visit(value[key], keyPath, dataSlot(keyPath, path), inner)
    }
    mark(path, {
      kind: 'fragment',
      form: 'full',
      name,
      registered: fragment !== undefined,
      arguments: args,
    })
  }

  // A named-arguments map is static and flattened beneath the header. A node,
  // or on a full call a reference, computes the arguments instead.
  const fragmentArguments = (
    value: unknown,
    path: Path,
    nodePath: Path,
    fragment: FragmentInfo | undefined,
    inner: Context,
    form: Form
  ) => {
    if (isObject(value) && !isNode(value)) {
      row(path).payload = 'flattened'
      for (const name in value) {
        const argumentPath = [...path, name]
        if (name === '//') mark(argumentPath, { kind: 'comment' })
        else
          visit(
            value[name],
            argumentPath,
            parameterSlot(argumentPath, nodePath, name, fragment?.parameters[name]),
            inner
          )
      }
      return 'static'
    }
    if (form === 'shorthand') row(path).payload = 'unlabelled'
    if (
      (isObject(value) && isNode(value)) ||
      (form === 'full' &&
        typeof value === 'string' &&
        recognizeReference(value).kind === 'reference')
    ) {
      visit(value, path, argumentsSlot(path, nodePath), inner)
      return 'dynamic'
    }
    return 'invalid'
  }

  // A malformed object, marked by the kind its keys suggest so that its
  // header can show the error. Its contents are not walked, as the compiler
  // refuses the node whole.
  const malformed = (value: Record<string, unknown>, message: string): RowKind => {
    const named = (key: 'operator' | 'fragment') =>
      typeof value[key] === 'string' ? value[key] : null
    if ('operator' in value) {
      const name = named('operator')
      const operator = name === null ? null : (operators.get(name)?.name ?? null)
      return { kind: 'operator', form: 'full', name, operator, malformed: message }
    }
    if ('fragment' in value) {
      const name = named('fragment')
      return {
        kind: 'fragment',
        form: 'full',
        name,
        registered: name !== null && fragments.has(name),
        arguments: 'none',
        malformed: message,
      }
    }
    const name = Object.keys(value)
      .find((key) => key.startsWith('$') && recognizes(key.slice(1)))!
      .slice(1)
    if (fragments.has(name))
      return {
        kind: 'fragment',
        form: 'shorthand',
        name,
        registered: true,
        arguments: 'none',
        malformed: message,
      }
    const operator = operators.get(name)?.name ?? null
    return { kind: 'operator', form: 'shorthand', name, operator, malformed: message }
  }

  visit(expression, [], rootSlot(), { scope: [], owner: null })
  return rows
}

const withVars = (value: Record<string, unknown>, path: Path, context: Context): Context =>
  isObject(value.vars)
    ? { ...context, scope: [...context.scope, { kind: 'vars', path: [...path, 'vars'] }] }
    : context

// The `as` names in scope, outermost first
export const bindings = (scope: readonly ScopeEntry[]) =>
  scope.flatMap((entry) => (entry.kind === 'iterator' && entry.as !== undefined ? [entry.as] : []))

// An iterator's `as`, where it is a literal name. An illegal one is
// `validate()`'s to report, and binds nothing.
const asName = (operator: OperatorInfo | undefined, node: Record<string, unknown>) => {
  if (operator?.parameters.as?.evaluation !== 'structural') return undefined
  const { as } = node
  return typeof as === 'string' && recognizeReference(as).kind === 'plain' ? as : undefined
}

// An element's declaration is its array parameter's, or a fragment's
const parameterOf = (slot: Slot) =>
  slot.declaration as ParameterInfo | FragmentParameter | undefined

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)
