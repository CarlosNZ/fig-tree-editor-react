import { type Issue } from 'fig-tree-evaluator'
import { type OperatorDisplay } from './displayData'
import { type EditorTheme } from './editorTheme'
import { CardLines, HoverCard, type CardLine } from './HoverCard'
import { EvaluateIcon, Icon } from './Icons'
import { CardIssues } from './IssueFlag'
import { RunCard } from './RunCard'
import { strings } from './strings'
import { type EvaluateControl } from './useEvaluation'

// A node's header (design, topic 3, "Header and toolbar"): the Evaluate
// button showing the name as written, with the node's card on hover, the
// pencil that opens the toolbar, shown on hover, and the display name at the
// top right, linked to its documentation. A broken node shows its name as an
// error with the issue's message, and no Evaluate button, since the compiler
// refuses it; its pencil stays, so a valid operator or fragment can be picked.
// A modifier-click on the button, with json-edit-react's clipboard modifier
// (Cmd or Ctrl, as a click on Copy copies the path), writes an operator's
// other spelling. A shorthand node's name is in italics, and its single value
// can sit on the button's line. The conversion button sits beneath the display
// name, in the node's colours, shown while it is hovered on a full node, and
// on a shorthand node while the header is, away from the Evaluate button. One
// that gives a reference shows while the header is hovered anywhere. The
// node's other issues, and those on rows it holds that no nearer node does,
// are listed at the top of the button's card, which then shows sooner, and a
// "!" badge on the button's corner, in the colour of the most severe, shows
// there is one without a hover (design, topic 7, "Where issues attach").
//
// A click on the button evaluates the node, and a spinner takes the ▶'s place
// while it runs, until a second click cancels it (topic 7, "Evaluating"), then
// a ✓ or ✕ for how it ran, and its card says how in place of its usual lines,
// after any issues ("How it ran, in the tree").
// Where the node can't be evaluated, the button is dimmed, a plain click does
// nothing, and its card says why; it isn't `disabled`, so a modifier-click
// still respells. After a click, its card stays hidden until the pointer
// leaves.

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
  card: CardLine[] // the hover card's lines
  cardNote?: string // a tip about the button, at the card's foot
  broken: Issue | undefined
  flagged?: readonly Issue[] // the node's other issues and its rows', for its card
  editorTheme: EditorTheme
  shorthand?: boolean
  inline?: React.ReactNode // after the button, on its line
  conversion?: { label: string; toReference?: boolean; onConvert: () => void }
  onEdit?: () => void // opens the toolbar; absent where the node can't be edited
  // A modifier-click on the button: an operator's other spelling, where it
  // has one and the node can be edited
  onRespell?: () => void
  respellModifiers?: readonly React.ModifierKey[]
  evaluation: EvaluateControl
}

export const DisplayBar = ({
  name,
  display,
  card,
  cardNote,
  broken,
  flagged = [],
  editorTheme,
  shorthand = false,
  inline,
  conversion,
  onEdit,
  onRespell,
  respellModifiers = [],
  evaluation,
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
          flagged={flagged}
          editorTheme={editorTheme}
          evaluation={evaluation}
          onClick={(e) => {
            const modifier = pressedModifier(e)
            if (modifier && respellModifiers.includes(modifier)) onRespell?.()
            else if (!evaluation.disabled) evaluation.onEvaluate()
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
      {conversion && display && (
        <span className="ft-convert-area">
          <button
            type="button"
            className={
              conversion.toReference
                ? 'ft-convert-button ft-convert-to-reference'
                : 'ft-convert-button'
            }
            onClick={conversion.onConvert}
            style={{ backgroundColor: display.backgroundColor, color: display.textColor }}
          >
            {conversion.label}
          </button>
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
  flagged,
  editorTheme,
  evaluation: { running, mark, blocked, disabled },
  onClick,
}: Pick<
  DisplayBarProps,
  'display' | 'card' | 'cardNote' | 'broken' | 'editorTheme' | 'evaluation'
> & {
  flagged: readonly Issue[]
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
      hideOnClick
      showAgainOn={mark}
      urgent={flagged.length > 0 || (!mark && disabled)}
      card={
        mark || card.length > 0 || cardNote !== undefined || disabled || flagged.length > 0 ? (
          <>
            {!mark && disabled && (
              <CardLines lines={[]} alert={{ text: blocked!, colour: editorTheme.error }} />
            )}
            <CardIssues issues={flagged} editorTheme={editorTheme} />
            {mark ? (
              <RunCard mark={mark} editorTheme={editorTheme} />
            ) : (
              <CardLines lines={card} note={cardNote} />
            )}
          </>
        ) : undefined
      }
    >
      <button
        type="button"
        className={disabled ? 'ft-evaluate-button ft-evaluate-blocked' : 'ft-evaluate-button'}
        onClick={onClick}
        aria-disabled={disabled || undefined}
        aria-busy={running || undefined}
        style={{ backgroundColor: display.backgroundColor, color: display.textColor }}
      >
        <span className="ft-name" style={{ fontSize: nameSize(label) }}>
          {label}
        </span>
        <EvaluateIcon running={running} mark={mark} editorTheme={editorTheme} />
      </button>
      {flagged.length > 0 && (
        <span
          className="ft-issue-badge"
          aria-hidden
          style={{
            backgroundColor:
              flagged[0].severity === 'error' ? editorTheme.error : editorTheme.warning,
          }}
        >
          !
        </span>
      )}
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
