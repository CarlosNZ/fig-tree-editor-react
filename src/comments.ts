import { type NodeData } from 'json-edit-react'
import { rowAt, type Classification } from './classify'

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
