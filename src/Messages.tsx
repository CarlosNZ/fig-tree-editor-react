import { useState } from 'react'
import { type Issue } from 'fig-tree-evaluator'
import { type EditorTheme } from './editorTheme'
import { Icon } from './Icons'
import { countMessages, type MessageLine } from './messageLines'
import { displayPath } from './paths'
import { strings } from './strings'

// The messages area (design, topic 7, "The messages area"), below the tree
// and as wide as it: shown only when it has lines, under a header of counts
// that folds it away, scrolling beyond `maxHeight`. Each line has its
// severity, the path of the row it marks and the full message.
export const Messages = ({
  lines,
  maxHeight,
  editorTheme,
}: {
  lines: readonly MessageLine[]
  maxHeight: number | string
  editorTheme: EditorTheme
}) => {
  const [open, setOpen] = useState(true)
  if (lines.length === 0) return null
  const counts = countMessages(lines)
  const pills: [Issue['severity'], number, (count: number) => string][] = [
    ['error', counts.errors, strings.FT_COUNT_ERRORS],
    ['warning', counts.warnings, strings.FT_COUNT_WARNINGS],
    ['hint', counts.hints, strings.FT_COUNT_HINTS],
  ]
  return (
    <div className="ft-message-container">
      <button
        type="button"
        className="ft-messages-header"
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
            ([severity, count, text]) =>
              count > 0 && (
                <span
                  className="ft-severity"
                  style={severityStyle(severity, editorTheme)}
                  key={severity}
                >
                  {text(count)}
                </span>
              )
          )}
        </span>
      </button>
      {open && (
        <ul className="ft-messages-list" style={{ maxHeight }}>
          {lines.map(({ issue, row }, index) => (
            <li className="ft-message" key={index}>
              <span className="ft-severity" style={severityStyle(issue.severity, editorTheme)}>
                {SEVERITY[issue.severity]}
              </span>
              <code className="ft-message-path">{displayPath(row) || strings.FT_ROOT_PATH}</code>
              <span className="ft-message-text">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SEVERITY = {
  error: strings.FT_SEVERITY_ERROR,
  warning: strings.FT_SEVERITY_WARNING,
  hint: strings.FT_SEVERITY_HINT,
}

const severityStyle = (severity: Issue['severity'], editorTheme: EditorTheme) => ({
  backgroundColor: editorTheme[severity],
})
