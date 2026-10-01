import { type Issue } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { drawnRow, SEVERITY_RANK } from './attachIssues'
import { type Classification } from './classify'
import { type Path } from './paths'

// The messages area's lines (design, topic 7, "The messages area"): every
// issue `validate()` reports, hints included, each on the row it marks, which
// is the issue's own row or its nearest drawn ancestor, as on the tree.

export interface MessageLine {
  issue: Issue
  row: Path
}

// A line's quick fix, ready to apply
export interface MessageFix {
  label: string
  apply: () => void
}

// One list in tree order, by the row each line marks, so reading down the
// list is reading down the tree; on one row, the most severe first, then
// `validate()`'s order. The editor sorts, since `validate()` reports a
// node's own issues after its children's, and the sample-data warnings last.
export const orderMessages = (
  issues: readonly Issue[],
  expression: unknown,
  classification: Classification
): MessageLine[] => {
  const order = treeOrder(expression)
  const position = (row: Path) => order.get(toPathString(row)) ?? order.size
  return issues
    .map((issue, index) => ({ issue, row: drawnRow(issue.path, classification), index }))
    .sort(
      (a, b) =>
        position(a.row) - position(b.row) ||
        SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity] ||
        a.index - b.index
    )
    .map(({ issue, row }) => ({ issue, row }))
}

// Each value's position in the tree as json-edit-react draws it: depth first,
// an object's keys and an array's elements in the order they are held
const treeOrder = (expression: unknown) => {
  const order = new Map<string, number>()
  const visit = (value: unknown, path: Path) => {
    order.set(toPathString(path), order.size)
    if (Array.isArray(value)) value.forEach((element, index) => visit(element, [...path, index]))
    else if (typeof value === 'object' && value !== null)
      for (const [key, child] of Object.entries(value)) visit(child, [...path, key])
  }
  visit(expression, [])
  return order
}

export interface MessageCounts {
  errors: number
  warnings: number
  hints: number
}

export const countMessages = (lines: readonly MessageLine[]): MessageCounts => ({
  errors: lines.filter(({ issue }) => issue.severity === 'error').length,
  warnings: lines.filter(({ issue }) => issue.severity === 'warning').length,
  hints: lines.filter(({ issue }) => issue.severity === 'hint').length,
})
