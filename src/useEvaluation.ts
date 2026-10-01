import { useSyncExternalStore } from 'react'
import { rowAt } from './classify'
import { type Shared } from './customNodeDefinitions'
import { type Path } from './paths'
import { strings } from './strings'
import { blockingErrors, buildSubTree } from './subTree'

// What an Evaluate affordance needs (design, topic 7, "Evaluating"): whether
// its row is the one running, why it can't be evaluated where it can't, and
// the click, which starts the row's evaluation, or cancels it while it runs.
// Only the affordances starting and stopping render as an evaluation does.
export interface EvaluateControl {
  running: boolean
  blocked: string | undefined // the reason, shown on hover
  disabled: boolean // blocked, and not running, which a click can still cancel
  onEvaluate: () => void
}

// `expression` is the whole tree, json-edit-react's `fullData`
export const useEvaluation = (path: Path, expression: unknown, shared: Shared): EvaluateControl => {
  const { evaluator } = shared
  const running = useSyncExternalStore(evaluator.subscribe, () => evaluator.isRunning(path))
  const blocked = whyBlocked(path, expression, shared)
  return {
    running,
    blocked,
    disabled: blocked !== undefined && !running,
    onEvaluate: () => evaluator.evaluate(path),
  }
}

// Why a row can't be evaluated, or undefined where it can: the errors that
// would refuse its evaluation, then a sub-tree that can't be built
export const whyBlocked = (
  path: Path,
  expression: unknown,
  { classification, issues, figTree }: Shared
) => {
  const context = { classification, operators: figTree.getOperators() }
  const errors = blockingErrors(path, [...issues.values()].flat(), context)
  if (errors.length > 0) return strings.FT_EVALUATE_BLOCKED(errors.length)
  if (buildSubTree(expression, path, context) !== null) return undefined
  const iterates = rowAt(classification, path)?.scope?.some(({ kind }) => kind === 'iterator')
  const map = context.operators.some(({ name }) => name === 'map')
  return iterates && !map ? strings.FT_EVALUATE_NO_MAP : strings.FT_EVALUATE_NO_INPUT
}
