import { type Issue } from 'fig-tree-evaluator'
import { type OperatorDisplay } from './displayData'
import { type EditorTheme } from './editorTheme'
import { CardLines, HoverCard } from './HoverCard'
import { Icon, Icons } from './Icons'
import { strings } from './strings'

// A node's header (design, topic 3, "Header and toolbar"): the Evaluate
// button showing the name as written, with the node's card on hover, the
// pencil that opens the toolbar, shown on hover, and the display name at the
// top right, linked to its documentation. A broken node shows its name as an
// error with the issue's message, and no Evaluate button, since the compiler
// refuses it; its pencil stays, so a valid operator or fragment can be picked.
// A modifier-click on the button, with json-edit-react's clipboard modifier
// (Cmd or Ctrl, as a click on Copy copies the path), writes an operator's
// other spelling. A shorthand node's name is in italics, and its single value
// can sit on the button's line.
//
// TO-DO: evaluating (plan, Phase 10), and the conversion button (Phase 8).

// What the header shows of an operator or fragment
export interface HeaderDisplay extends Pick<
  OperatorDisplay,
  'displayName' | 'docUrl' | 'backgroundColor' | 'textColor'
> {
  suffix?: string // after the display name, where there is room
}

interface DisplayBarProps {
  name: string | null // as written; null when it isn't a string
  display: HeaderDisplay | undefined // undefined when nothing is registered
  card: string[] // the hover card's lines
  cardNote?: string // a tip about the button, at the card's foot
  broken: Issue | undefined
  editorTheme: EditorTheme
  shorthand?: boolean
  inline?: React.ReactNode // after the button, on its line
  onEdit?: () => void // opens the toolbar; absent where the node can't be edited
  // A modifier-click on the button: an operator's other spelling, where it
  // has one and the node can be edited
  onRespell?: () => void
  respellModifiers?: readonly React.ModifierKey[]
}

export const DisplayBar = ({
  name,
  display,
  card,
  cardNote,
  broken,
  editorTheme,
  shorthand = false,
  inline,
  onEdit,
  onRespell,
  respellModifiers = [],
}: DisplayBarProps) => {
  const label = name ?? strings.FT_INVALID_NODE
  return (
    <div className={shorthand ? 'ft-display-bar ft-shorthand' : 'ft-display-bar'}>
      <span className="ft-display-bar-start">
        <NameOrButton
          label={label}
          display={display}
          card={card}
          cardNote={cardNote}
          broken={broken}
          editorTheme={editorTheme}
          onClick={(e) => {
            const modifier = pressedModifier(e)
            if (onRespell && modifier && respellModifiers.includes(modifier)) onRespell()
          }}
        />
        {onEdit && (
          <button
            type="button"
            className="ft-edit-button"
            onClick={() => onEdit()}
            aria-label={strings.FT_OPEN_TOOLBAR}
          >
            <Icon name="edit" style={{ color: 'rgb(42, 161, 152)' }} />
          </button>
        )}
        {inline && <div className="ft-display-bar-value">{inline}</div>}
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
          {display.suffix && <span className="ft-display-name-suffix">{display.suffix}</span>}
        </span>
      )}
    </div>
  )
}

const NameOrButton = ({
  label,
  display,
  card,
  cardNote,
  broken,
  editorTheme,
  onClick,
}: Pick<DisplayBarProps, 'display' | 'card' | 'cardNote' | 'broken' | 'editorTheme'> & {
  label: string
  onClick: (e: React.MouseEvent) => void
}) =>
  broken || !display ? (
    <span className="ft-broken" style={{ color: editorTheme.error }}>
      <span className="ft-name">{label}</span>
      {broken && <span className="ft-broken-message">{broken.message}</span>}
    </span>
  ) : (
    <HoverCard
      card={
        card.length > 0 || cardNote !== undefined ? (
          <CardLines lines={card} note={cardNote} />
        ) : undefined
      }
    >
      <button
        type="button"
        className="ft-evaluate-button"
        onClick={onClick}
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

// The modifier held on a click, one only, as json-edit-react reads it for its
// own modifier-clicks (copying a path, collapsing everything)
const pressedModifier = (e: React.MouseEvent): React.ModifierKey | undefined => {
  if (e.shiftKey) return 'Shift'
  if (e.metaKey) return 'Meta'
  if (e.ctrlKey) return 'Control'
  if (e.altKey) return 'Alt'
  return undefined
}
