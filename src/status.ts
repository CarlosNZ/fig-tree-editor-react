import { deepEqual, type Issue } from 'fig-tree-evaluator'
import { type JsonEditorHandle } from 'json-edit-react'
import { type MessageCounts, type MessageFix } from './messageLines'
import { type Path } from './paths'

// What the editor tells a host about its state (design, topic 8, "Telling
// the host about state"): for gating its own actions, such as a Save button
// while there are errors or an edit is open, and for drawing its own messages
// in place of the built-in area.

export interface EditorStatus {
  valid: boolean // no errors; warnings and filled-in values don't count
  counts: MessageCounts
  editing: boolean // an edit session is open: a value, raw JSON or the toolbar
  messages: EditorMessage[] // what the messages area lists, in its order
  // The top-level values a failure could get out of, with no fallback to
  // catch it (fig-tree's `fallbackCoverage`), under the instance's options:
  // each is a place a `fallback` belongs. The check takes every operator and
  // fragment call to be able to fail, so it flags some that can't. Empty
  // when every value is covered, and null while there are errors, when it
  // means nothing.
  uncovered: Path[] | null
}

// A line of the messages area: an issue `validate()` reports, or a value the
// editor filled in, at the row it marks, with its fixes. Each fix's `apply`
// does what the built-in button does.
export type EditorMessage = {
  row: Path
  message: string
  fixes: MessageFix[]
} & ({ kind: 'issue'; issue: Issue } | { kind: 'filledIn' })

// json-edit-react's handle, with the messages area's reveal: it opens the
// row's collapsed ancestors and scrolls it into view
export interface FigTreeEditorHandle extends JsonEditorHandle {
  reveal: (options: { path: Path }) => true | 'PATH_NOT_FOUND'
}

// Whether two statuses are the same by content. A fix is its label, since
// its `apply` is new on every render.
export const sameStatus = (a: EditorStatus, b: EditorStatus) =>
  deepEqual(byContent(a), byContent(b))

const byContent = (status: EditorStatus) => ({
  ...status,
  messages: status.messages.map((message) => ({
    ...message,
    fixes: message.fixes.map(({ label }) => label),
  })),
})
