import { type FigTreeError, type TraceNode, type TraceStatus } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { rowAt, type Classification, type Row } from './classify'
import { type Evaluation, type EvaluationFailure } from './evaluation'
import { isWithin, type Path } from './paths'

// How an evaluation ran, row by row (design, topic 7, "How it ran, in the
// tree"), from its trace: what the tree marks on each node, reference and
// piece of plain data that took part, and what their cards say. The rows are
// the evaluated row, everything in it, and the parts of the scope wrapped
// around it that ran for it: an iterator's input, and the wrapped blocks'
// vars.
//
// A row that didn't run has a reason, in general terms, since the trace gives
// none: what the walk records of its slot, or the row that didn't run around
// it.
//
// Plain data is marked as the trace records it: a constant, plain data
// holding no node or reference, as one piece, its rows inside unmarked, and
// plain data holding a node or reference (a container) as itself, with each
// constant in it marked as its own piece. The trace has an entry for a
// constant that is a parameter, an element or an entry of its own, but none
// for one beside a node or reference in a container, which ran wherever what
// holds it ran.

// What a marked row is
export type RunPart = 'node' | 'reference' | 'constant' | 'container'

export interface RowRun {
  path: Path
  part: RunPart
  status: TraceStatus // the worst of its runs, or skipped where it had none
  // Each time it ran, or was passed over, in order: one per element inside
  // an iterator, and none where the run never reached it
  runs: readonly RunInstance[]
  perElement: boolean // inside an iterator, so it runs once per element
  reason?: NotRunReason // where it was skipped or cancelled
  // On the evaluated row, the failures that left nulls in its value
  nulls: readonly EvaluationFailure[]
}

export interface RunInstance {
  status: TraceStatus
  value?: unknown
  error?: FigTreeError // why it failed, or what its fallback caught, as fig-tree has it
  failedAt?: Path // where that error is from, in the tree
  elapsed?: number // in milliseconds, what it holds included
  // A value from the cache: its own lookup's, or for a fragment call, every
  // lookup its body made, since the body has no rows to show them
  cached: boolean
}

export type NotRunReason =
  | { kind: 'whenNeeded' } // a lazy parameter, element or entry
  | { kind: 'fallbackUnused' } // its node succeeded
  | { kind: 'unread' } // a var nothing read
  | { kind: 'race' } // stopped once the answer was known
  | { kind: 'timeout' } // stopped by the instance's timeout
  | { kind: 'stopped' } // cancelled, otherwise
  | { kind: 'inside'; path: Path; status: 'skipped' | 'cancelled' } // a row that didn't run holds it
  | { kind: 'notReached' } // the run stopped short of it
  | { kind: 'notEvaluated' } // skipped, otherwise

// By the row's path, as json-edit-react's `toPathString` gives it
export type RunMarks = ReadonlyMap<string, RowRun>

// Every node and reference that took part in the evaluation, with the
// evaluated row whatever it is, or null for a cancelled one, which leaves
// nothing. `row` is where the row is in the trace, as the sub-tree has it.
export const markRun = (
  evaluation: Evaluation,
  classification: Classification,
  row: Path
): RunMarks | null => {
  if (evaluation.status === 'cancelled') return null
  const { path: evaluated, trace } = evaluation
  const partOf = parts(classification)
  const evaluatedRow = rowAt(classification, evaluated)
  const evaluatedPart = partOf(evaluatedRow, evaluated) ?? 'container'
  if (trace === undefined) return failedWithoutTrace(evaluation, evaluatedPart)

  const { runs, regions } = readTrace(trace, evaluation, row)
  const marked = new Map<string, MarkedRow>([
    [toPathString(evaluated), { path: evaluated, row: evaluatedRow, part: evaluatedPart }],
  ])
  for (const row of classification.values()) {
    const path = row.slot?.path
    const part = path && partOf(row, path)
    if (path && part && regions.some((region) => isWithin(path, region)))
      marked.set(toPathString(path), { path, row, part })
  }

  // Each row with runs first, so a row without any finds what holds it
  const marks = new Map<string, RowRun>()
  for (const [key, { path, row, part }] of marked) {
    const instances = runs.get(key)
    if (instances === undefined) continue
    const status = worst(instances)
    marks.set(key, {
      path,
      part,
      status,
      runs: instances,
      perElement: inIterator(row),
      ...(status === 'skipped' && { reason: skippedReason(row) }),
      ...(status === 'cancelled' && { reason: cancelledReason(row, evaluation) }),
      nulls: [],
    })
  }
  for (const [key, { path, row, part }] of marked) {
    if (marks.has(key)) continue
    const reason = unrunReason(path, runs, marks)
    // Plain data with no entry of its own ran wherever what holds it ran
    const reached = isPlain(part) && reason.kind === 'notReached' && heldByRun(path, runs)
    marks.set(key, {
      path,
      part,
      status: reached ? 'value' : 'skipped',
      runs: [],
      perElement: inIterator(row),
      ...(!reached && { reason }),
      nulls: [],
    })
  }

  takeNulls(evaluation, marks)
  return marks
}

// A row the run marks
interface MarkedRow {
  path: Path
  row: Row | undefined
  part: RunPart
}

// The trace's entries by the tree's rows, and the parts of the tree the run
// took in: the evaluated row, and each part of the scope wrapped around it
// that ran for it. A wrapper's own entry stands for the row's ancestor
// holding the scope, which itself never ran. A wrapped vars block holds the
// var the row is, or is in, as well, and nothing reads that copy, so only
// the row's own entries stand for it. A fragment body's entries are in the
// body, not the tree, so the call stands in for them: its run is cached
// where the body made cache lookups and every one hit.
const readTrace = (trace: TraceNode, { path: evaluated, toTreePath }: Evaluation, row: Path) => {
  const runs = new Map<string, RunInstance[]>()
  const regions: Path[] = [evaluated]
  const bodies = new Map<RunInstance, { hits: number; misses: number }>()
  const visit = (entry: TraceNode, call: RunInstance | undefined) => {
    if (entry.source !== undefined) {
      if (call) {
        const count = bodies.get(call) ?? { hits: 0, misses: 0 }
        bodies.set(call, count)
        countLookups(entry, count)
      }
      return
    }
    const path = toTreePath(entry.path)
    if (isWithin(path, evaluated) && !isWithin(entry.path, row)) return
    const wrapper = path.length < evaluated.length && isWithin(evaluated, path)
    const run = wrapper ? undefined : instance(entry, toTreePath)
    if (run) {
      const key = toPathString(path)
      runs.set(key, [...(runs.get(key) ?? []), run])
      if (!regions.some((region) => isWithin(path, region))) regions.push(path)
    }
    entry.children?.forEach((child) => visit(child, run))
  }
  visit(trace, undefined)
  for (const [call, { hits, misses }] of bodies) if (hits > 0 && misses === 0) call.cached = true
  return { runs, regions }
}

// The cache lookups an entry and everything in it made
const countLookups = (entry: TraceNode, count: { hits: number; misses: number }) => {
  for (const { type, hit } of entry.events ?? [])
    if (type === 'cache') {
      if (hit === true) count.hits++
      else count.misses++
    }
  entry.children?.forEach((child) => countLookups(child, count))
}

const instance = (
  { status, value, error, elapsed, events }: TraceNode,
  toTreePath: (path: Path) => Path
): RunInstance => ({
  status,
  ...(status !== 'skipped' && status !== 'failed' && status !== 'cancelled' && { value }),
  ...(error !== undefined && { error, failedAt: toTreePath(error.path) }),
  ...(elapsed !== undefined && { elapsed }),
  cached: events?.some(({ type, hit }) => type === 'cache' && hit === true) ?? false,
})

const isPlain = (part: RunPart) => part === 'constant' || part === 'container'

// A plain row's mark, or undefined where it has none or isn't plain data
export const plainMark = (run: RunMarks | null, path: Path) => {
  const mark = run?.get(toPathString(path))
  return mark !== undefined && isPlain(mark.part) ? mark : undefined
}

// Whether plain data that ran shows a ✓, as a reference does: every constant
// that ran, as one piece. A container shows none, since each piece in it
// shows its own.
export const showsTick = (mark: RowRun) => mark.status === 'value' && mark.part === 'constant'

// What each row the tree marks is, or undefined where it marks none: a node,
// a reference, and plain data in an evaluated position other than the root,
// a flattened payload, whose rows are its node's own, an `as` name and
// `useCache`, which configure their node, and a row inside a constant
const parts = (classification: Classification) => {
  const live = holdingNodes(classification)
  const plain = (row: Row | undefined, path: Path) =>
    row?.kind === undefined &&
    row?.slot !== undefined &&
    !row.slot.literalOnly &&
    row.payload !== 'flattened' &&
    path.length > 0
  // Plain data holding no node or reference, in an evaluated position or
  // not, as a shorthand's argument list is
  const constantAt = (path: Path) => {
    const row = rowAt(classification, path)
    return (
      row !== undefined &&
      row.kind === undefined &&
      row.payload !== 'flattened' &&
      !live.has(toPathString(path))
    )
  }
  return (row: Row | undefined, path: Path): RunPart | undefined => {
    const kind = row?.kind?.kind
    if (kind === 'operator' || kind === 'fragment' || kind === 'literal') return 'node'
    if (kind === 'reference') return 'reference'
    if (kind !== undefined && kind !== 'container') return undefined
    if (kind === 'container' || live.has(toPathString(path)))
      return path.length > 0 && row?.payload !== 'flattened' ? 'container' : undefined
    if (!plain(row, path)) return undefined
    return constantAt(path.slice(0, -1)) ? undefined : 'constant'
  }
}

// Every row holding a node or a reference, by its path, the row itself
// included
const holdingNodes = (classification: Classification) => {
  const live = new Set<string>()
  for (const { kind, slot } of classification.values()) {
    const node =
      kind?.kind === 'operator' ||
      kind?.kind === 'fragment' ||
      kind?.kind === 'literal' ||
      kind?.kind === 'reference'
    if (node && slot !== undefined)
      for (let length = 0; length <= slot.path.length; length++)
        live.add(toPathString(slot.path.slice(0, length)))
  }
  return live
}

// Whether the nearest row above a path with runs of its own ran, so plain
// data inside it with none was reached
const heldByRun = (path: Path, runs: ReadonlyMap<string, readonly RunInstance[]>) => {
  for (let length = path.length - 1; length >= 0; length--) {
    const instances = runs.get(toPathString(path.slice(0, length)))
    if (instances !== undefined) return worst(instances) !== 'skipped'
  }
  return false
}

// A row inside an iterator's per-element parameter, which the run wraps in
// the iterator, as it does every iterator in the evaluated row
const inIterator = (row: Row | undefined) =>
  row?.scope?.some(({ kind }) => kind === 'iterator') ?? false

// Inside an iterator, a row is marked by the worst of its runs
const SEVERITY: TraceStatus[] = ['failed', 'fallback', 'cancelled', 'value', 'skipped']
const worst = (instances: readonly RunInstance[]) =>
  SEVERITY.find((status) => instances.some((run) => run.status === status)) ?? 'skipped'

const LAZY = ['lazy', 'lazyElements', 'lazyEntries']

// What the walk records of a skipped row's place says why it was passed over
const skippedReason = (row: Row | undefined): NotRunReason => {
  const slot = row?.slot
  if (slot?.role === 'modifier' && slot.parameter === 'fallback') return { kind: 'fallbackUnused' }
  if (slot?.role === 'var') return { kind: 'unread' }
  const evaluation = evaluationOf(slot?.declaration)
  return evaluation !== undefined && LAZY.includes(evaluation)
    ? { kind: 'whenNeeded' }
    : { kind: 'notEvaluated' }
}

const cancelledReason = (row: Row | undefined, { failures }: Evaluation): NotRunReason => {
  if (failures.some(({ error }) => error.code === 'timeout')) return { kind: 'timeout' }
  return evaluationOf(row?.slot?.declaration) === 'race' ? { kind: 'race' } : { kind: 'stopped' }
}

const evaluationOf = (declaration: object | undefined) =>
  declaration !== undefined && 'evaluation' in declaration
    ? (declaration.evaluation as string | undefined)
    : undefined

// A row with no runs: inside the nearest row above it that ran or was passed
// over, where that one didn't run, and otherwise never reached
const unrunReason = (
  path: Path,
  runs: ReadonlyMap<string, readonly RunInstance[]>,
  marks: ReadonlyMap<string, RowRun>
): NotRunReason => {
  for (let length = path.length - 1; length >= 0; length--) {
    const above = path.slice(0, length)
    const key = toPathString(above)
    const instances = runs.get(key)
    if (instances === undefined) continue
    const status = marks.get(key)?.status ?? worst(instances)
    return status === 'skipped' || status === 'cancelled'
      ? { kind: 'inside', path: above, status }
      : { kind: 'notReached' }
  }
  return { kind: 'notReached' }
}

// The failures that left nulls in the evaluated row's value. A failure fails
// every node above it, whatever the parameter's null policy, so only plain
// data outside any node keeps a null, and the evaluated row is what holds it.
const takeNulls = ({ path, failures }: Evaluation, marks: Map<string, RowRun>) => {
  const key = toPathString(path)
  const mark = marks.get(key)!
  if (mark.status === 'failed') return
  const nulls = failures.filter(
    ({ holePath }) =>
      holePath !== undefined && holePath.length > path.length && isWithin(holePath, path)
  )
  if (nulls.length > 0) marks.set(key, { ...mark, nulls })
}

// An evaluation with no trace, which fig-tree refused, or which failed other
// than through fig-tree: the evaluated row failed, with why
const failedWithoutTrace = ({ path, failures }: Evaluation, part: RunPart): RunMarks =>
  new Map([
    [
      toPathString(path),
      {
        path,
        part,
        status: 'failed',
        perElement: false,
        runs: failures.slice(0, 1).map(({ error }) => ({ status: 'failed', error, cached: false })),
        nulls: [],
      },
    ],
  ])
