import { type Issue } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { drawnRow, SEVERITY_RANK } from './attachIssues'
import { type Classification } from './classify'
import { type FilledInLine } from './filledIn'
import { type Path } from './paths'

// The messages area's lines (design, topic 7, "The messages area"): every
// issue `validate()` reports, hints included, each on the row it marks, which
// is the issue's own row or its nearest drawn ancestor, as on the tree; and
// each value the editor filled in that still stands (filledIn.ts).

export type MessageLine =
  { kind: 'issue'; issue: Issue; row: Path } | ({ kind: 'filledIn' } & FilledInLine)

// A line's quick fix, ready to apply
export interface MessageFix {
  label: string
  apply: () => void
}

// One list in tree order, by the row each line marks, so reading down the
// list is reading down the tree; on one row, the most severe first, then a
// filled-in line, each kind in the order given. The editor sorts, since
// `validate()` reports a node's own issues after its children's, and the
// sample-data warnings last.
export const orderMessages = (
  issues: readonly Issue[],
  filledIn: readonly FilledInLine[],
  expression: unknown,
  classification: Classification
): MessageLine[] => {
  const order = treeOrder(expression)
  const position = (row: Path) => order.get(toPathString(row)) ?? order.size
  const lines: MessageLine[] = [
    ...issues.map((issue) => ({
      kind: 'issue' as const,
      issue,
      row: drawnRow(issue.path, classification),
    })),
    ...filledIn.map((line) => ({ kind: 'filledIn' as const, ...line })),
  ]
  const rank = (line: MessageLine) =>
    line.kind === 'issue' ? SEVERITY_RANK[line.issue.severity] : FILLED_IN_RANK
  // The sort is stable, so each kind keeps its order on a row
  return lines.sort((a, b) => position(a.row) - position(b.row) || rank(a) - rank(b))
}

const FILLED_IN_RANK = 3

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
  filledIn: number
}

// Counts the messages area's lines, or the host's messages built from them
export const countMessages = (
  lines: readonly ({ kind: 'issue'; issue: Issue } | { kind: 'filledIn' })[]
): MessageCounts => {
  const severity = (of: Issue['severity']) =>
    lines.filter((line) => line.kind === 'issue' && line.issue.severity === of).length
  return {
    errors: severity('error'),
    warnings: severity('warning'),
    hints: severity('hint'),
    filledIn: lines.filter(({ kind }) => kind === 'filledIn').length,
  }
}
