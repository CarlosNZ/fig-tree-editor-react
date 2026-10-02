import { FigTreeError, isFigTreeError, type FigTree, type TraceNode } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { isWithin, type Path } from './paths'
import { type SubTree } from './subTree'

// Evaluating a row (design, topic 7, "Evaluating"; topic 8, "Evaluation"):
// its sub-tree (subTree.ts), evaluated with the trace on, reported as data
// with every path in the tree's coordinates but the trace's. fig-tree's
// rejection never reaches the host.

export interface EvaluationFailure {
  message: string
  path: Path // the failed row, in the tree
  holePath?: Path // what degraded to null, in the tree
  fragment?: string // for a failure inside a fragment body
  fragmentPath?: Path // where in the body, in its own coordinates
  error: FigTreeError // fig-tree's own, in the sub-tree's coordinates
}

export interface Evaluation {
  path: Path // the row evaluated, in the tree
  mode: 'report' | 'throw'
  // Failed: the row gave no value, as a failure in throw mode, or in report
  // mode a failure whose hole holds the row, a failure with no hole, which
  // fails the whole evaluation (a timeout), or an evaluation fig-tree
  // refused. A partial result in report mode is done, with its failures.
  status: 'done' | 'failed' | 'cancelled'
  result?: unknown // when done; in report mode it may hold nulls where holes failed
  failures: EvaluationFailure[]
  fallbacks: { path: Path; error: FigTreeError }[] // those that fired, with what they caught
  trace?: TraceNode // fig-tree's own, in the sub-tree's coordinates; absent when cancelled
  toTreePath: (path: Path) => Path // maps a path in `trace` into the tree
}

export interface EvaluateOptions {
  mode: 'report' | 'throw'
  data?: Record<string, unknown> // `$data`, in place of the instance's own
  signal?: AbortSignal
}

export const evaluateSubTree = async (
  figTree: FigTree,
  path: Path,
  subTree: SubTree,
  { mode, data, signal }: EvaluateOptions
): Promise<Evaluation> => {
  const { toTreePath } = subTree
  const failure = (error: FigTreeError): EvaluationFailure => ({
    message: error.message,
    path: toTreePath(error.path),
    ...(error.holePath && { holePath: toTreePath(error.holePath) }),
    ...(error.fragment !== undefined && { fragment: error.fragment }),
    ...(error.fragmentPath && { fragmentPath: error.fragmentPath }),
    error,
  })
  const settled = (
    status: 'done' | 'failed',
    errors: FigTreeError[],
    trace: TraceNode | undefined
  ): Evaluation => ({
    path,
    mode,
    status,
    failures: errors.map(failure),
    fallbacks: firedFallbacks(trace, toTreePath),
    ...(trace && { trace }),
    toTreePath,
  })

  try {
    const { result, errors, trace } = await figTree.evaluate(subTree.expression, {
      mode,
      trace: true,
      signal,
      ...(data !== undefined && { data }),
    })
    // A refused evaluation has no trace
    const failed =
      trace === undefined ||
      errors.some(({ holePath }) => holePath === undefined || isWithin(subTree.row, holePath))
    return failed
      ? settled('failed', errors, trace)
      : { ...settled('done', errors, trace), result: subTree.readResult(result) }
  } catch (thrown) {
    // fig-tree rejects with its own errors, but anything else is a failure
    // too, and doesn't escape
    const error = isFigTreeError(thrown)
      ? thrown
      : new FigTreeError({
          code: 'unexpected',
          message: thrown instanceof Error ? thrown.message : String(thrown),
          path: subTree.row,
          cause: thrown,
        })
    if (error.code === 'aborted') return cancelledEvaluation(path, subTree, mode)
    return settled('failed', [error], error.trace)
  }
}

export const cancelledEvaluation = (
  path: Path,
  { toTreePath }: SubTree,
  mode: 'report' | 'throw'
): Evaluation => ({ path, mode, status: 'cancelled', failures: [], fallbacks: [], toTreePath })

// The fallbacks the trace shows firing, in the tree's own nodes: one in a
// fragment body has a path in the body, so isn't among them
const firedFallbacks = (trace: TraceNode | undefined, toTreePath: (path: Path) => Path) => {
  const fired: Evaluation['fallbacks'] = []
  const visit = (node: TraceNode) => {
    if (node.source !== undefined) return
    if (node.status === 'fallback' && node.error)
      fired.push({ path: toTreePath(node.path), error: node.error })
    node.children?.forEach(visit)
  }
  if (trace) visit(trace)
  return fired
}

// ── One evaluation at a time ──────────────────────────────────────────────

// Starting an evaluation cancels the one running, and starting the one
// running cancels it (topic 7). Every start is reported, then exactly one
// evaluation: a cancelled one at once, and otherwise its own when it
// settles. Each affordance subscribes to whether it is the one running, so
// only those starting and stopping render.
export interface Evaluator {
  evaluate: (path: Path) => void
  cancel: () => void
  isRunning: (path: Path) => boolean
  subscribe: (listener: () => void) => () => void
}

// A row ready to evaluate, or null where it can't be
export interface PreparedEvaluation {
  start: (signal: AbortSignal) => Promise<Evaluation>
  cancelled: () => Evaluation
}

export interface EvaluatorHandlers {
  prepare: (path: Path) => PreparedEvaluation | null
  onStart: (path: Path) => void
  onEvaluate: (evaluation: Evaluation) => void
}

// The handlers are read as each evaluation starts and ends, so they can
// follow the latest props
export const createEvaluator = (handlers: () => EvaluatorHandlers): Evaluator => {
  let running: { key: string; abort: AbortController; prepared: PreparedEvaluation } | null = null
  const listeners = new Set<() => void>()
  const setRunning = (next: typeof running) => {
    running = next
    listeners.forEach((listener) => listener())
  }

  const cancel = () => {
    if (running === null) return
    const { abort, prepared } = running
    setRunning(null)
    abort.abort()
    handlers().onEvaluate(prepared.cancelled())
  }

  const evaluate = (path: Path) => {
    const key = toPathString(path)
    const again = running?.key === key
    cancel()
    if (again) return
    const prepared = handlers().prepare(path)
    if (prepared === null) return
    const abort = new AbortController()
    handlers().onStart(path)
    const current = { key, abort, prepared }
    setRunning(current)
    // It starts once the editor has drawn what starting changes, the spinner
    // and the last run's marks going, which fig-tree's trace would otherwise
    // time as part of the first node
    setTimeout(() => {
      if (running !== current) return
      void prepared.start(abort.signal).then((evaluation) => {
        // Cancelled meanwhile, and reported then
        if (running !== current) return
        setRunning(null)
        handlers().onEvaluate(evaluation)
      })
    }, 0)
  }

  return {
    evaluate,
    cancel,
    isRunning: (path) => running?.key === toPathString(path),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
