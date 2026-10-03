import { useState } from 'react'
import { type Issue } from 'fig-tree-evaluator'
import { filledInText, type EditorTheme } from './editorTheme'
import { Icon } from './Icons'
import { countMessages } from './messageLines'
import { displayPath, type Path } from './paths'
import { type EditorMessage } from './status'
import { strings } from './strings'

// The messages area (design, topic 7, "The messages area"), below the tree
// and as wide as it: shown only when it has lines, under a header of counts
// that folds it away, scrolling beyond `maxHeight`. Each line has its
// severity, or "added" for a value the editor filled in, the path of the row
// it marks, which reveals the row, and the full message, with its quick fixes
// at the top right. Where more than one value was filled in, the header can
// dismiss them all.
export const Messages = ({
  messages,
  maxHeight,
  editorTheme,
  onReveal,
  onDismissAll,
}: {
  messages: readonly EditorMessage[]
  maxHeight: number | string
  editorTheme: EditorTheme
  onReveal: (row: Path) => void
  onDismissAll: () => void
}) => {
  const [open, setOpen] = useState(true)
  if (messages.length === 0) return null
  const counts = countMessages(messages)
  const pills: [Label, number, (count: number) => string][] = [
    ['error', counts.errors, strings.FT_COUNT_ERRORS],
    ['warning', counts.warnings, strings.FT_COUNT_WARNINGS],
    ['filledIn', counts.filledIn, strings.FT_COUNT_FILLED_IN],
  ]
  return (
    <div className="ft-message-container">
      <div className="ft-messages-header">
        <button
          type="button"
          className="ft-messages-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span
            className={open ? 'ft-messages-chevron' : 'ft-messages-chevron ft-messages-closed'}
            aria-hidden="true"
          >
            <Icon name="collection" scale={0.7} />
          </span>
          <span className="ft-messages-title">{strings.FT_MESSAGES}</span>
          <span className="ft-messages-counts">
            {pills.map(
              ([label, count, text]) =>
                count > 0 && (
                  <span className="ft-severity" style={labelStyle(label, editorTheme)} key={label}>
                    {text(count)}
                  </span>
                )
            )}
          </span>
        </button>
        {counts.filledIn > 1 && (
          <button type="button" className="ft-fix" onClick={onDismissAll}>
            {strings.FT_DISMISS_ALL}
          </button>
        )}
      </div>
      {open && (
        <ul className="ft-messages-list" style={{ maxHeight }}>
          {messages.map((message, index) => (
            <li className="ft-message" key={index}>
              <span className="ft-message-content">
                <span className="ft-severity" style={labelStyle(labelOf(message), editorTheme)}>
                  {LABEL[labelOf(message)]}
                </span>
                <button
                  type="button"
                  className="ft-message-path"
                  title={strings.FT_REVEAL_ROW}
                  onClick={() => onReveal(message.row)}
                >
                  {displayPath(message.row) || strings.FT_ROOT_PATH}
                </button>
                <span className="ft-message-text">{message.message}</span>
              </span>
              {message.fixes.length > 0 && (
                <span className="ft-message-fixes">
                  {message.fixes.map(({ label, apply }) => (
                    <button type="button" className="ft-fix" key={label} onClick={apply}>
                      {label}
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// A line's label: its issue's severity, or a filled-in value's
type Label = Issue['severity'] | 'filledIn'

const labelOf = (message: EditorMessage): Label =>
  message.kind === 'issue' ? message.issue.severity : 'filledIn'

const LABEL: Record<Label, string> = {
  error: strings.FT_SEVERITY_ERROR,
  warning: strings.FT_SEVERITY_WARNING,
  filledIn: strings.FT_FILLED_IN,
}

// White on a severity's colour, and dark on the filled-in colour, which is
// too light for white
const labelStyle = (label: Label, editorTheme: EditorTheme) =>
  label === 'filledIn'
    ? { backgroundColor: editorTheme.filledIn, color: filledInText(editorTheme.filledIn) }
    : { backgroundColor: editorTheme[label] }
