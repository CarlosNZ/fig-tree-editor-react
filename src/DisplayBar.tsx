import { type Issue } from 'fig-tree-evaluator'
import { type OperatorDisplay } from './displayData'
import { type EditorTheme } from './editorTheme'
import { HoverCard } from './HoverCard'
import { Icon, Icons } from './Icons'
import { strings } from './strings'

// A node's header (design, topic 3, "Header and toolbar"): the Evaluate
// button showing the name as written, with the description on hover, the
// pencil that opens the toolbar, shown on hover, and the display name at the
// top right, linked to its documentation. A broken node shows its name as an
// error with the issue's message, and no Evaluate button, since the compiler
// refuses it; its pencil stays, so a valid operator can be picked.
//
// TO-DO: evaluating (plan, Phase 10), and the conversion button (Phase 8).

interface DisplayBarProps {
  name: string | null // as written; null when it isn't a string
  display: OperatorDisplay | undefined // undefined when nothing is registered
  broken: Issue | undefined
  editorTheme: EditorTheme
  onEdit?: () => void // opens the toolbar; absent where the node can't be edited
}

export const DisplayBar = ({ name, display, broken, editorTheme, onEdit }: DisplayBarProps) => {
  const label = name ?? strings.FT_INVALID_NODE
  return (
    <div className="ft-display-bar">
      <span className="ft-display-bar-start">
        <NameOrButton label={label} display={display} broken={broken} editorTheme={editorTheme} />
        {onEdit && (
          <button
            type="button"
            className="ft-edit-button"
            onClick={onEdit}
            aria-label={strings.FT_OPEN_TOOLBAR}
          >
            <Icon name="edit" style={{ color: 'rgb(42, 161, 152)' }} />
          </button>
        )}
      </span>
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

const NameOrButton = ({
  label,
  display,
  broken,
  editorTheme,
}: Omit<DisplayBarProps, 'name' | 'onEdit'> & { label: string }) =>
  broken || !display ? (
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
  )

// A symbol is set large enough to read at a glance, and a long name small
// enough to keep the button compact
const nameSize = (name: string) => {
  if (name.length === 1) return '2em'
  if (name.length < 3) return '1.6em'
  if (name.length < 7) return '1.2em'
  if (name.length < 15) return '1em'
  return '0.9em'
}
