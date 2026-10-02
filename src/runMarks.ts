import { type FigTreeError, type TraceNode, type TraceStatus } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { rowAt, type Classification, type Row } from './classify'
import { type Evaluation, type EvaluationFailure } from './evaluation'
import { isWithin, type Path } from './paths'

// How an evaluation ran, row by row (design, topic 7, "How it ran, in the
// tree"), from its trace: what the tree marks on each node and reference
// that took part, and what their cards say. The rows are the evaluated
// row, everything in it, and the parts of the scope wrapped around it that
// ran for it: an iterator's input, and the wrapped blocks' vars.
//
// A row that didn't run has a reason, in general terms, since the trace gives
// none: what the walk records of its slot, or the row that didn't run around
// it.

export interface RowRun {
  path: Path
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
  cached: boolean // a value from the cache
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
// nothing
export const markRun = (
  evaluation: Evaluation,
  classification: Classification
): RunMarks | null => {
  if (evaluation.status === 'cancelled') return null
  const { path: evaluated, trace } = evaluation
  if (trace === undefined) return failedWithoutTrace(evaluation)

  const { runs, regions } = readTrace(trace, evaluation)
  const marked = new Map<string, MarkedRow>([
    [toPathString(evaluated), { path: evaluated, row: rowAt(classification, evaluated) }],
  ])
  for (const row of classification.values()) {
    const path = row.slot?.path
    if (path && takesPart(row) && regions.some((region) => isWithin(path, region)))
      marked.set(toPathString(path), { path, row })
  }

  // Each row with runs first, so a row without any finds what holds it
  const marks = new Map<string, RowRun>()
  for (const [key, { path, row }] of marked) {
    const instances = runs.get(key)
    if (instances === undefined) continue
    const status = worst(instances)
    marks.set(key, {
      path,
      status,
      runs: instances,
      perElement: inIterator(row),
      ...(status === 'skipped' && { reason: skippedReason(row) }),
      ...(status === 'cancelled' && { reason: cancelledReason(row, evaluation) }),
      nulls: [],
    })
  }
  for (const [key, { path, row }] of marked)
    if (!marks.has(key))
      marks.set(key, {
        path,
        status: 'skipped',
        runs: [],
        perElement: inIterator(row),
        reason: unrunReason(path, runs, marks),
        nulls: [],
      })

  takeNulls(evaluation, marks)
  return marks
}

// A row the run marks
interface MarkedRow {
  path: Path
  row: Row | undefined
}

// The trace's entries by the tree's rows, and the parts of the tree the run
// took in: the evaluated row, and each part of the scope wrapped around it
// that ran for it. A wrapper's own entry stands for the row's ancestor
// holding the scope, which itself never ran, and a fragment body's entries
// are in the body, not the tree.
const readTrace = (trace: TraceNode, { path: evaluated, toTreePath }: Evaluation) => {
  const runs = new Map<string, RunInstance[]>()
  const regions: Path[] = [evaluated]
  const visit = (entry: TraceNode) => {
    if (entry.source !== undefined) return
    const path = toTreePath(entry.path)
    const wrapper = path.length < evaluated.length && isWithin(evaluated, path)
    if (!wrapper) {
      const key = toPathString(path)
      runs.set(key, [...(runs.get(key) ?? []), instance(entry, toTreePath)])
      if (!regions.some((region) => isWithin(path, region))) regions.push(path)
    }
    entry.children?.forEach(visit)
  }
  visit(trace)
  return { runs, regions }
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

// A node or a reference, which the tree marks
const takesPart = ({ kind }: Row) =>
  kind?.kind === 'operator' ||
  kind?.kind === 'fragment' ||
  kind?.kind === 'literal' ||
  kind?.kind === 'reference'

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
const failedWithoutTrace = ({ path, failures }: Evaluation): RunMarks =>
  new Map([
    [
      toPathString(path),
      {
        path,
        status: 'failed',
        perElement: false,
        runs: failures.slice(0, 1).map(({ error }) => ({ status: 'failed', error, cached: false })),
        nulls: [],
      },
    ],
  ])
