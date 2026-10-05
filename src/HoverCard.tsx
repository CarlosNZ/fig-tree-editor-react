import { Fragment, useEffect, useId, useState, type ReactNode } from 'react'
import { type ExpectedType } from 'fig-tree-evaluator'
import { strings } from './strings'

// A card shown once its anchor has been hovered, or focused from the
// keyboard, for a moment (the stylesheet's `--ft-hover-card-delay`), and
// hidden as soon as it isn't. It floats over the rows beneath it, so it never
// changes the tree's layout (design, topic 4, "Parameter metadata"), and the
// stylesheet alone shows and hides it, so hovering re-renders nothing. With
// `hideOnClick`, a click on the anchor hides it until the pointer leaves, so
// it doesn't cover what the click shows, or until `showAgainOn` changes, as
// an Evaluate's does when its result arrives: with the pointer still there,
// the card then shows, after the usual delay. An `urgent` card, holding an
// issue or why something can't be evaluated, shows sooner
// (`--ft-issue-card-delay`). The card hangs from the anchor's left edge, or,
// with `align: 'end'`, its right, for an anchor at the right of its space.
//
// A host can use it, with `CardLines`, for cards of its own beside the
// editor's. Its rules are in the editor's stylesheet, which a mounted editor
// injects, or which the host adds itself (`style.css`).
export const HoverCard = ({
  card,
  hideOnClick = false,
  showAgainOn,
  urgent = false,
  align = 'start',
  children,
}: {
  card: ReactNode
  hideOnClick?: boolean
  showAgainOn?: unknown
  urgent?: boolean
  align?: 'start' | 'end'
  children: ReactNode
}) => {
  const id = useId()
  const [clicked, setClicked] = useState(false)
  useEffect(() => setClicked(false), [showAgainOn])
  if (card === undefined || card === null || card === '') return children
  return (
    <span
      className="ft-hover-card-anchor"
      aria-describedby={id}
      data-clicked={clicked || undefined}
      data-urgent={urgent || undefined}
      data-align={align === 'end' ? align : undefined}
      {...(hideOnClick && {
        onClick: () => setClicked(true),
        onPointerLeave: () => setClicked(false),
      })}
    >
      {children}
      <span className="ft-hover-card" role="tooltip" id={id}>
        {card}
      </span>
    </span>
  )
}

// A card line, or a detail: a fact about the row in its current place, such
// as whether its cache is in force, muted and bulleted under what the card
// describes
export type CardLine = string | { detail: string }

// A card's lines, one to a line, with the names in backticks shown as code.
// A parameter's card starts with a title line, and an operator's ends with
// the types its result can be. A node's can end with a note, a tip about the
// control set smaller than what the card describes. An alert, such as why the
// control is disabled, comes first, in its colour.
export const CardLines = ({
  lines,
  titled = false,
  returns,
  note,
  alert,
}: {
  lines: CardLine[]
  titled?: boolean
  returns?: ExpectedType
  note?: string
  alert?: { text: string; colour: string }
}) => (
  <>
    {alert && (
      <span className="ft-hover-card-line ft-hover-card-alert" style={{ color: alert.colour }}>
        {withCode(alert.text)}
      </span>
    )}
    {lines.map((line, index) =>
      typeof line === 'string' ? (
        <span
          className={
            titled && index === 0 ? 'ft-hover-card-line ft-hover-card-title' : 'ft-hover-card-line'
          }
          key={index}
        >
          {withCode(line)}
        </span>
      ) : (
        <span className="ft-hover-card-line ft-hover-card-detail" key={index}>
          {withCode(line.detail)}
        </span>
      )
    )}
    {returns !== undefined && (
      <span className="ft-hover-card-line ft-hover-card-returns">
        {strings.FT_CARD_RETURNS} <TypeUnion type={returns} />
      </span>
    )}
    {note !== undefined && (
      <span className="ft-hover-card-line ft-hover-card-note">{withCode(note)}</span>
    )}
  </>
)

// A type as it would be declared, "string | null", each member coloured as
// json-edit-react colours a value of that type, and a literal union's values
// as written, "'test' | 'match'"
const TypeUnion = ({ type }: { type: ExpectedType }) => {
  const members =
    typeof type === 'string'
      ? [{ text: type, type }]
      : 'literal' in type
        ? type.literal.map((value) => ({
            text: typeof value === 'string' ? `'${value}'` : String(value),
            type: typeof value,
          }))
        : type.map((member) => ({ text: member, type: member }))
  return members.map(({ text, type }, index) => (
    <Fragment key={index}>
      {index > 0 && <span className="ft-type-separator"> | </span>}
      <code className="ft-type" data-type={type}>
        {text}
      </code>
    </Fragment>
  ))
}

export const withCode = (line: string) =>
  line
    .split('`')
    .map((segment, part) => (part % 2 === 1 ? <code key={part}>{segment}</code> : segment))
