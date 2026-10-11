import {
  FigTreeError,
  isFigTreeError,
  type FigTree,
  type FragmentDefinition,
  type FragmentParameterDeclaration,
  type TraceNode,
} from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { draftName } from './draft'
import { type Path } from './paths'
import { strings } from './strings'
import { type SubTree } from './subTree'

// Evaluating a row (design, topic 7, "Evaluating"; topic 8, "Evaluation"):
// its sub-tree (subTree.ts), evaluated with the trace on, reported as data
// with every path in the tree's coordinates but the trace's. fig-tree's
// rejection never reaches the host.
//
// In fragment mode the sub-tree is a fragment body: it is registered, with
// the definition's declarations, on an instance derived from the host's, and
// evaluated as a call to it with the definition's samples
// (fragment-editor-design.md, "Evaluation"). The trace is the call's, with
// the body's entries under `expression`.

export interface EvaluationFailure {
  message: string
  path: Path // the failed row, in the tree
  fragment?: string // for a failure inside a called fragment's body
  fragmentPath?: Path // where in the body, in its own coordinates
  error: FigTreeError // fig-tree's own, in the sub-tree's coordinates
}

export interface Evaluation {
  path: Path // the row evaluated, in the tree
  // Failed: a failure no `fallback` caught, which fails the whole evaluation,
  // as a timeout does, or an evaluation fig-tree refused
  status: 'done' | 'failed' | 'cancelled'
  result?: unknown // when done
  failure?: EvaluationFailure // when failed
  fallbacks: { path: Path; error: FigTreeError }[] // those that fired, with what they caught
  trace?: TraceNode // fig-tree's own, in the sub-tree's coordinates; absent when cancelled
  toTreePath: (path: Path) => Path // maps a path in `trace` into the tree
  // In fragment mode, the name the body was registered under: the trace's
  // entries with `source: { fragment: draft }` are the tree's
  draft?: string
}

export interface EvaluateOptions {
  data?: Record<string, unknown> // `$data`, in place of the instance's own
  signal?: AbortSignal
  fragment?: FragmentDefinition // in fragment mode, the definition the row is in
  fragmentName?: string // and the name it is registered under, where it is
}

export const evaluateSubTree = async (
  figTree: FigTree,
  path: Path,
  subTree: SubTree,
  { data, signal, fragment, fragmentName }: EvaluateOptions
): Promise<Evaluation> => {
  const target: Target = fragment
    ? asDraftCall(figTree, path, subTree, fragment, fragmentName)
    : { instance: figTree, expression: subTree.expression, toTreePath: subTree.toTreePath }
  if ('refused' in target) return target.refused
  const { instance, expression, toTreePath, draft, reword = unchanged } = target
  const located = { toTreePath, ...(draft !== undefined && { draft }) }
  try {
    const { result, trace } = await instance.evaluate(expression, {
      trace: true,
      signal,
      ...(data !== undefined && { data }),
    })
    return {
      path,
      status: 'done',
      result: subTree.readResult(result),
      fallbacks: firedFallbacks(trace, located),
      trace,
      ...located,
    }
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
    if (error.code === 'aborted') return cancelledEvaluation(path, subTree)
    // A refused evaluation has no trace
    const { trace } = error
    return {
      path,
      status: 'failed',
      failure: {
        message: reword(error.message),
        path: failedRow(error, located),
        ...calledFragment(error, draft),
        error,
      },
      fallbacks: firedFallbacks(trace, located),
      ...(trace && { trace }),
      ...located,
    }
  }
}

// What a row is evaluated as, and on which instance, or why it can't be
type Target =
  | {
      instance: FigTree
      expression: unknown
      toTreePath: (path: Path) => Path
      draft?: string
      reword?: (message: string) => string // a failure's message, as the author knows it
    }
  | { refused: Evaluation }

const unchanged = (message: string) => message

// The body is registered under a name nothing else claims (draft.ts), with
// the definition's declarations, so a call to it applies their defaults and
// checks the samples against them as a real call does. The samples are the
// call's arguments, so are read as a caller's are. A definition that can't
// be registered refuses the evaluation, as a static error refuses one, and
// so does a required parameter without a sample, which would fail every
// row's call alike, whether the row reads it or not. A failure's message
// names the fragment as the author knows it, not by the temporary name.
const asDraftCall = (
  figTree: FigTree,
  path: Path,
  subTree: SubTree,
  { parameters = {}, samples = {} }: FragmentDefinition,
  fragmentName = strings.FT_DRAFT_NAME
): Target => {
  const draft = draftName(figTree)
  // A fragment's name holds no character a pattern reads specially
  const named = new RegExp(`'${draft}(?=['.])`, 'g')
  const reword = (message: string) => message.replace(named, `'${fragmentName}`)
  const refuse = (error: FigTreeError): Target => ({
    refused: {
      path,
      status: 'failed',
      failure: { message: reword(error.message), path, error },
      fallbacks: [],
      toTreePath: subTree.toTreePath,
    },
  })

  let instance: FigTree
  try {
    instance = figTree.with({
      fragments: { [draft]: { expression: subTree.expression, parameters } },
    })
  } catch (thrown) {
    if (!isFigTreeError(thrown)) throw thrown
    return refuse(thrown)
  }
  const unsampled = Object.entries(parameters)
    .filter(([name, declaration]) => isRequired(declaration) && samples[name] == null)
    .map(([name]) => name)
  if (unsampled.length > 0)
    return refuse(
      new FigTreeError({
        code: 'missing-required',
        message: strings.FT_RUN_NO_SAMPLE(unsampled),
        path: [],
      })
    )
  return {
    instance,
    expression: { fragment: draft, parameters: samples },
    // The call around the body, and its arguments, are the evaluated row
    toTreePath: (at: Path) => (at[0] === BODY ? subTree.toTreePath(at.slice(1)) : path),
    draft,
    reword,
  }
}

// A parameter is required unless it says not, or has a default, as fig-tree
// reads a declaration. A sample of null is unset, as an argument is.
const isRequired = ({ required, default: fallback }: FragmentParameterDeclaration) =>
  required ?? fallback === undefined

// Where a registered body is, in its fragment's definition
const BODY = 'expression'

// Where a fragment body's rows are in the trace, by their paths in the body
export const inDraftBody = (path: Path, draft: string | undefined) =>
  draft === undefined ? path : [BODY, ...path]

// What a trace entry is: the tree's own; part of the call around a draft
// body, which the tree doesn't have; or part of a called fragment's body,
// whose call stands in for it
export const entryKind = (
  { source }: TraceNode,
  draft: string | undefined
): 'tree' | 'call' | 'body' => {
  if (source === undefined) return draft === undefined ? 'tree' : 'call'
  return source.fragment === draft ? 'tree' : 'body'
}

// The row an error is from, in the tree. Once a failure has left a fragment
// body, fig-tree gives where in the body it failed as `fragmentPath`, and
// keeps its `path` at the call. A failure in the draft body is the tree's,
// so is at its `fragmentPath`; one in a fragment the body calls, at the call.
export const failedRow = (
  error: FigTreeError,
  { toTreePath, draft }: Pick<Evaluation, 'toTreePath' | 'draft'>
) =>
  draft !== undefined && error.fragment === draft
    ? toTreePath(error.fragmentPath ?? [])
    : toTreePath(error.path)

// The called fragment a failure is from, and where in its body, unless that
// is the draft body, which is the tree
export const calledFragment = (error: FigTreeError, draft: string | undefined) =>
  error.fragment === undefined || error.fragment === draft
    ? {}
    : {
        fragment: error.fragment,
        ...(error.fragmentPath && { fragmentPath: error.fragmentPath }),
      }

export const cancelledEvaluation = (path: Path, { toTreePath }: SubTree): Evaluation => ({
  path,
  status: 'cancelled',
  fallbacks: [],
  toTreePath,
})

// The fallbacks the trace shows firing, in the tree's own nodes: one in a
// called fragment's body has a path in that body, so isn't among them
const firedFallbacks = (
  trace: TraceNode | undefined,
  { toTreePath, draft }: Pick<Evaluation, 'toTreePath' | 'draft'>
) => {
  const fired: Evaluation['fallbacks'] = []
  const visit = (node: TraceNode) => {
    const kind = entryKind(node, draft)
    if (kind === 'body') return
    if (kind === 'tree' && node.status === 'fallback' && node.error)
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
