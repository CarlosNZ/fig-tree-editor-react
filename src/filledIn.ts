import { deepEqual } from 'fig-tree-evaluator'
import { toPathString } from 'json-edit-react'
import { canonicalPath, rowAt, type Classification } from './classify'
import { valueAt, type Path } from './paths'
import { strings } from './strings'

// The values the fill-in step added to an expression the editor was given
// (design, topic 2, "Marking what was filled in on load"), which nothing in
// the expression or in `validate()` records once they are there. Each has a
// line in the messages area while its row still holds the value added, and
// leaves the record when the line is dismissed or the row's own edit is
// committed. Rows are kept by canonical path (plan, 8.4), so a conversion
// keeps a line.

export interface FilledIn {
  path: Path // canonical
  value: unknown // what the editor put there
  message: string // as worded when it was added, so a later switch can't falsify it
}

// Keyed by the canonical path, as json-edit-react's `toPathString` gives it
export type FilledInRecord = ReadonlyMap<string, FilledIn>

export const NO_FILLED_IN: FilledInRecord = new Map()

// A line for a value that still stands, at its row's current path
export interface FilledInLine {
  key: string
  row: Path
  message: string
}

// The record with the rows a fill added, each replacing any entry for its
// row. `filled` and `classification` are the filled expression's.
export const recordFilledIn = (
  record: FilledInRecord,
  filled: readonly Path[],
  expression: unknown,
  classification: Classification
): FilledInRecord => {
  const next = new Map(record)
  for (const path of filled) {
    const canonical = canonicalPath(classification, path)
    next.set(toPathString(canonical), {
      path: canonical,
      value: valueAt(expression, path),
      message: describeFill(path, classification),
    })
  }
  return next
}

// "Added 'then', which 'if' requires", from the row's slot and the node it
// belongs to, by the name as written. A `literal`'s `value` has no row, since
// its content isn't walked.
const describeFill = (path: Path, classification: Classification) => {
  const slot = rowAt(classification, path)?.slot
  const parameter = slot?.parameter ?? String(path[path.length - 1])
  const owner = rowAt(classification, slot?.ownerPath ?? path.slice(0, -1))?.kind
  if (owner?.kind === 'fragment') return strings.FT_FILLED_IN_FRAGMENT(parameter, owner.name ?? '')
  const name = owner?.kind === 'operator' ? (owner.name ?? '') : 'literal'
  return strings.FT_FILLED_IN_OPERATOR(parameter, name)
}

// The lines for the values whose rows still hold them. A row that doesn't
// keeps its entry, so an undo, or the toolbar's ✗, brings its line back with
// the value.
export const standingFilledIn = (
  record: FilledInRecord,
  expression: unknown,
  classification: Classification
): FilledInLine[] => {
  let moved: Map<string, Path> | undefined
  // A row's current path: its canonical one, unless a shorthand form has
  // moved it, which needs every row's
  const rowFor = (key: string, path: Path) => {
    const unmoved = toPathString(canonicalPath(classification, path)) === key
    if (unmoved && valueAt(expression, path) !== undefined) return path
    moved ??= movedRows(classification)
    return moved.get(key)
  }
  const lines: FilledInLine[] = []
  for (const [key, { path, value, message }] of record) {
    const row = rowFor(key, path)
    if (row !== undefined && deepEqual(valueAt(expression, row), value))
      lines.push({ key, row, message })
  }
  return lines
}

const movedRows = (classification: Classification) => {
  const rows = new Map<string, Path>()
  for (const { slot } of classification.values())
    if (slot) rows.set(toPathString(canonicalPath(classification, slot.path)), slot.path)
  return rows
}

// The record less the entry for the row an edit was committed on, or the row
// holding it, its value changed or not: confirming a value accepts it. An
// edit of the node holding the row doesn't count. `path` is canonical. The
// same record where none goes.
export const confirmFilledIn = (record: FilledInRecord, path: Path): FilledInRecord => {
  const confirmed = [...record].filter(([, entry]) => isWithin(path, entry.path))
  if (confirmed.length === 0) return record
  const next = new Map(record)
  for (const [key] of confirmed) next.delete(key)
  return next
}

export const dismissFilledIn = (record: FilledInRecord, key: string): FilledInRecord => {
  const next = new Map(record)
  next.delete(key)
  return next
}

const isWithin = (path: Path, prefix: Path) =>
  prefix.length <= path.length && prefix.every((key, index) => path[index] === key)
