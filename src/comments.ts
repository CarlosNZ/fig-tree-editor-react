import { isCollection, type NodeData } from 'json-edit-react'
import { rowAt, type Classification } from './classify'
import { type Path } from './paths'

// What a row is in a comment (design, topic 5, "Comments"): a note, a string
// `//`; a block of lines, a `//` array; or one of its lines, which the walk
// doesn't record, since a comment's value is quoted, so a line is found by
// its parent's row. A `//` holding anything else is plain data, and only its
// key is marked.
export type CommentPart = 'note' | 'lines' | 'line'

export const commentPart = (
  classification: Classification,
  { path, value, parentData }: Pick<NodeData, 'path' | 'value' | 'parentData'>
): CommentPart | undefined => {
  if (isComment(classification, path)) {
    if (typeof value === 'string') return 'note'
    if (Array.isArray(value)) return 'lines'
    return undefined
  }
  if (Array.isArray(parentData) && path.length > 0 && isComment(classification, path.slice(0, -1)))
    return 'line'
  return undefined
}

const isComment = (classification: Classification, path: NodeData['path']) =>
  rowAt(classification, path)?.kind?.kind === 'comment'

// A comment of lines never has fewer than two (plan, 9.4): where a write takes
// one a line short of two, as deleting a line does, one of two leaves the
// other as a string comment, and the line of a one-line array, as one may
// load, leaves no comment, as deleting a string comment does. Only a write
// that shortens a comment is read, so a loaded one is left as it is. Walks
// the write beside the expression it replaces, into only what it changed,
// and what it leaves unchanged comes back as the same object.
export const settleCommentLines = (
  previous: unknown,
  next: unknown,
  classification: Classification,
  path: Path = []
): unknown => {
  if (next === previous || !isCollection(next) || !isCollection(previous)) return next
  const before = previous as Record<string, unknown>
  let changed = false
  const entries = Object.entries(next).flatMap(([key, value]): [string, unknown][] => {
    const childPath = [...path, Array.isArray(next) ? Number(key) : key]
    if (
      key === '//' &&
      lostLine(before[key], value) &&
      rowAt(classification, childPath)?.kind?.kind === 'comment'
    ) {
      changed = true
      return (value as unknown[]).length === 1 ? [[key, (value as unknown[])[0]]] : []
    }
    const settled = settleCommentLines(before[key], value, classification, childPath)
    if (settled !== value) changed = true
    return [[key, settled]]
  })
  if (!changed) return next
  return Array.isArray(next) ? entries.map(([, value]) => value) : Object.fromEntries(entries)
}

const lostLine = (before: unknown, after: unknown) =>
  Array.isArray(before) &&
  Array.isArray(after) &&
  after.length < 2 &&
  after.length === before.length - 1
