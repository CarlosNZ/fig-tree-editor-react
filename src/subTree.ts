import { type Issue, type OperatorInfo } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { rowAt, type Classification } from './classify'
import { isWithin, valueAt, type Path } from './paths'

// Sub-tree evaluation (design, topic 7, "Sub-tree evaluation"): a row is
// evaluated as an expression of its own, the row wrapped in the scope its
// ancestors give it, so fig-tree sees a self-contained expression and the
// author gets the value the row has in the tree.
//
// From the inside out: the row as it stands, with its own modifiers; for each
// enclosing iterator whose per-element parameter holds the row, a `map` over
// that iterator's input, with its `as`, and the row as its `each`, giving one
// value per element; and for each enclosing `vars` block, a plain object
// holding the block and the rest as `value`. Nesting rather than merging
// keeps shadowing as it is in the tree. Ancestors take part only through
// their blocks and inputs, so an ancestor's `fallback` can't catch a failure
// in the row. The pieces are the tree's own objects, since fig-tree doesn't
// change what it evaluates.

export interface SubTree {
  expression: unknown
  // The row's value, out of the wrappers: one per element inside an
  // iterator, an array for each. A wrapper's failed value, which report mode
  // gives as null, reads as null.
  readResult: (result: unknown) => unknown
  // A path in `expression`, such as a failure's, as the tree's
  toTreePath: (path: Path) => Path
}

export interface SubTreeContext {
  classification: Classification
  operators: readonly OperatorInfo[]
}

// The scope a row is wrapped in, outermost first, by the tree's paths
type Wrapper =
  | { kind: 'vars'; block: Path; holder: Path } // the node or object holding it
  | { kind: 'iterator'; node: Path; input: Path; as: Path | undefined }

// The row at `path` as an expression of its own, or null where it can't be
// one: the row is gone, an iterator around it has no input to go over, or
// no `map` is registered to wrap it in
export const buildSubTree = (
  expression: unknown,
  path: Path,
  context: SubTreeContext
): SubTree | null => {
  const row = valueAt(expression, path)
  const wrappers = row === undefined ? null : wrappersFor(path, context)
  if (wrappers === null) return null

  let built = row
  for (const wrapper of [...wrappers].reverse())
    built =
      wrapper.kind === 'vars'
        ? { vars: valueAt(expression, wrapper.block), value: built }
        : {
            operator: 'map',
            input: valueAt(expression, wrapper.input),
            ...(wrapper.as && { as: valueAt(expression, wrapper.as) }),
            each: built,
          }

  // What each piece of the expression stands for in the tree, by its path
  // in the expression: the wrappers themselves, the blocks and inputs they
  // carry, and the row
  const pieces: [Path, Path][] = []
  let at: Path = []
  for (const wrapper of wrappers)
    if (wrapper.kind === 'vars') {
      pieces.push([at, wrapper.holder], [[...at, 'vars'], wrapper.block])
      at = [...at, 'value']
    } else {
      pieces.push([at, wrapper.node], [[...at, 'input'], wrapper.input])
      if (wrapper.as) pieces.push([[...at, 'as'], wrapper.as])
      at = [...at, 'each']
    }
  pieces.push([at, path])

  const unwrap = (value: unknown, depth: number): unknown => {
    if (depth === wrappers.length) return value
    if (wrappers[depth].kind === 'vars')
      return isObject(value) ? unwrap(value.value, depth + 1) : null
    return Array.isArray(value) ? value.map((element) => unwrap(element, depth + 1)) : null
  }

  return {
    expression: built,
    readResult: (result) => unwrap(result, 0),
    toTreePath: (synthesised) => {
      let best: [Path, Path] = pieces[0]
      for (const piece of pieces)
        if (piece[0].length > best[0].length && isWithin(synthesised, piece[0])) best = piece
      return [...best[1], ...synthesised.slice(best[0].length)]
    },
  }
}

// The errors that keep a row from being evaluated (design, topic 7,
// "Evaluating"): fig-tree refuses an expression with a static error, so any
// error at or under the row, or in what its wrappers carry, a `vars` block or
// an iterator's input or `as`, refuses it. At the root, that is every error.
// Warnings never block.
export const blockingErrors = (path: Path, issues: readonly Issue[], context: SubTreeContext) => {
  const carried = [
    path,
    ...(wrappersFor(path, context) ?? []).flatMap((wrapper) =>
      wrapper.kind === 'vars'
        ? [wrapper.block]
        : [wrapper.input, ...(wrapper.as ? [wrapper.as] : [])]
    ),
  ]
  return issues.filter(
    ({ severity, path: at }) => severity === 'error' && carried.some((part) => isWithin(at, part))
  )
}

// The walk's scope chain for the row, with each iterator's input and `as`
// found in whatever form its node is written
const wrappersFor = (path: Path, context: SubTreeContext): Wrapper[] | null => {
  const scope = rowAt(context.classification, path)?.scope ?? []
  const iterates = scope.some(({ kind }) => kind === 'iterator')
  if (iterates && !context.operators.some(({ name }) => name === 'map')) return null
  const wrappers: Wrapper[] = []
  for (const entry of scope) {
    if (entry.kind === 'vars') {
      wrappers.push({ kind: 'vars', block: entry.path, holder: entry.path.slice(0, -1) })
      continue
    }
    const parts = iteratorParts(entry.path, path, context)
    if (parts === null) return null
    wrappers.push({ kind: 'iterator', node: entry.path, ...parts })
  }
  return wrappers
}

// An iterator's input, the parameter its per-element parameter holding the
// row goes `over`, and its `as`, by their rows, which the walk records in
// any of the node's forms
const iteratorParts = (node: Path, row: Path, { classification, operators }: SubTreeContext) => {
  const rows = new Map<string, Path>()
  const nodeKey = toPathString(node)
  for (const { slot } of classification.values())
    if (
      slot?.role === 'parameter' &&
      slot.parameter !== undefined &&
      slot.ownerPath !== null &&
      toPathString(slot.ownerPath) === nodeKey
    )
      rows.set(slot.parameter, slot.path)
  const kind = rowAt(classification, node)?.kind
  const operator =
    kind?.kind === 'operator' ? operators.find(({ name }) => name === kind.operator) : undefined
  const over = Object.entries(operator?.parameters ?? {}).find(
    ([name, { evaluation }]) =>
      evaluation === 'perElement' && rows.has(name) && isWithin(row, rows.get(name)!)
  )?.[1].over
  const input = over === undefined ? undefined : rows.get(over)
  return input === undefined ? null : { input, as: rows.get('as') }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
