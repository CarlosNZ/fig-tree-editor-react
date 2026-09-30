import { type Issue } from 'fig-tree-evaluator'
import { type OperatorDisplay } from './displayData'
import { type EditorTheme } from './editorTheme'
import { HoverCard } from './HoverCard'
import { Icons } from './Icons'
import { strings } from './strings'

// A node's header (design, topic 3, "Header and toolbar"): the Evaluate
// button showing the name as written, with the description on hover, and the
// display name at the top right, linked to its documentation. A broken node
// shows its name as an error with the issue's message, and no Evaluate
// button, since the compiler refuses it.
//
// TO-DO: evaluating (plan, Phase 10), and the pencil and the conversion button
// (5.2 and Phase 8).

interface DisplayBarProps {
  name: string | null // as written; null when it isn't a string
  display: OperatorDisplay | undefined // undefined when nothing is registered
  broken: Issue | undefined
  editorTheme: EditorTheme
}

export const DisplayBar = ({ name, display, broken, editorTheme }: DisplayBarProps) => {
  const label = name ?? strings.FT_INVALID_NODE
  return (
    <div className="ft-display-bar">
      {broken || !display ? (
        <span className="ft-broken" style={{ color: editorTheme.error }}>
          <span className="ft-name">{label}</span>
          {broken && <span className="ft-broken-message">{broken.message}</span>}
        </span>
      ) : (
        <HoverCard card={display.description}>
          <button
            type="button"
            className="ft-evaluate-button"
            style={{ backgroundColor: display.backgroundColor, color: display.textColor }}
          >
            <span className="ft-name" style={{ fontSize: nameSize(label) }}>
              {label}
            </span>
            {Icons.evaluate}
          </button>
        </HoverCard>
      )}
      {display && (
        <span className="ft-display-name">
          {display.docUrl ? (
            <a href={display.docUrl} target="_blank" rel="noreferrer">
              {display.displayName}
            </a>
          ) : (
            display.displayName
          )}
        </span>
      )}
    </div>
  )
}

// A symbol is set large enough to read at a glance, and a long name small
// enough to keep the button compact
const nameSize = (name: string) => {
  if (name.length === 1) return '2em'
  if (name.length < 3) return '1.6em'
  if (name.length < 7) return '1.2em'
  if (name.length < 15) return '1em'
  return '0.9em'
}
