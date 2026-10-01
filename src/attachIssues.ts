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

// What a row's flag shows: its errors, then its warnings, each in
// `validate()`'s order. A hint shows in the messages area alone.
export const flaggedIssues = (index: IssueIndex, path: Path) =>
  issuesAt(index, path)
    .filter(({ severity }) => severity !== 'hint')
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

const SEVERITY_RANK: Record<Issue['severity'], number> = { error: 0, warning: 1, hint: 2 }

// The errors and warnings on a row and every row beneath it, which a
// collapsed row carries in its summary (topic 7), keyed as the index is
export interface IssueCounts {
  errors: number
  warnings: number
}

export type IssueRollUp = ReadonlyMap<string, IssueCounts>

export const rollUpIssues = (
  issues: readonly Issue[],
  classification: Classification
): IssueRollUp => {
  const rollUp = new Map<string, IssueCounts>()
  for (const { severity, path } of issues) {
    if (severity === 'hint') continue
    const row = drawnRow(path, classification)
    for (let length = 0; length <= row.length; length++) {
      const key = toPathString(row.slice(0, length))
      const counts = rollUp.get(key) ?? { errors: 0, warnings: 0 }
      rollUp.set(key, {
        errors: counts.errors + (severity === 'error' ? 1 : 0),
        warnings: counts.warnings + (severity === 'warning' ? 1 : 0),
      })
    }
  }
  return rollUp
}

const NO_COUNTS: IssueCounts = { errors: 0, warnings: 0 }

export const issuesBeneath = (rollUp: IssueRollUp, path: Path) =>
  rollUp.get(toPathString(path)) ?? NO_COUNTS

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
// `validate()` reports some malformations on the node's own key, and the
// key's row shows the issue too: a stray key beside a shorthand's `$name`, a
// second `$name`, a fragment's `$name` row holding a string, `useCache` on a
// fragment call, `parameters` on an operator node. A key whose row is a node
// is left out, since an issue there may be that node's own
// (`condition: { operator: 42 }`).
const BROKEN = new Set<string>(['malformed-node', 'unknown-operator', 'unknown-fragment'])

const NODE_KINDS = new Set(['operator', 'fragment', 'literal'])

export const brokenIssue = (
  index: IssueIndex,
  classification: Classification,
  path: Path,
  node: unknown
) =>
  issuesAt(index, path).find(({ code }) => BROKEN.has(code)) ??
  ownKeys(node)
    .map((key) => [...path, key])
    .filter((keyPath) => !NODE_KINDS.has(rowAt(classification, keyPath)?.kind?.kind ?? ''))
    .flatMap((keyPath) => issuesAt(index, keyPath))
    .find(({ code }) => code === 'malformed-node')

const ownKeys = (node: unknown) =>
  typeof node === 'object' && node !== null && !Array.isArray(node) ? Object.keys(node) : []
