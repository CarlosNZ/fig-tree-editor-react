import { type Issue } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { rowAt, type Classification } from './classify'
import { type Path } from './paths'

// Where each of `validate()`'s issues shows (design, topic 7, "Where issues
// attach"): on the row at its path, or, where that row isn't drawn, on the
// nearest drawn ancestor. The rows not drawn are the `operator` and
// `fragment` rows a node's header shows, and a flattened payload's own row.
// Keyed by json-edit-react's `toPathString`, as the classification is, and in
// `validate()`'s order.
//
// TO-DO: a collapsed row's roll-up of the issues beneath it (plan, Phase 10).

export type IssueIndex = ReadonlyMap<string, readonly Issue[]>

export const attachIssues = (
  issues: readonly Issue[],
  classification: Classification
): IssueIndex => {
  const index = new Map<string, Issue[]>()
  for (const issue of issues) {
    const key = toPathString(drawnRow(issue.path, classification))
    index.set(key, [...(index.get(key) ?? []), issue])
  }
  return index
}

const NONE: readonly Issue[] = []

export const issuesAt = (index: IssueIndex, path: Path) => index.get(toPathString(path)) ?? NONE

const drawnRow = (path: Path, classification: Classification) => {
  let row = path
  while (row.length > 0) {
    const entry = rowAt(classification, row)
    if (!entry?.filtered && entry?.payload !== 'flattened') break
    row = row.slice(0, -1)
  }
  return row
}

// A node is broken when it can't be read as a node (topic 7): it is
// malformed, or names no registered operator or fragment. The compiler and
// `./format` both refuse it, so it has no Evaluate and no conversion.
//
// TO-DO: a shorthand node's stray keys, where `malformed-node` sits on the
// key's own row (plan, Phase 8).
const BROKEN = new Set<string>(['malformed-node', 'unknown-operator', 'unknown-fragment'])

export const brokenIssue = (issues: readonly Issue[]) => issues.find(({ code }) => BROKEN.has(code))
