import { useEffect, useId, useState, type ReactNode } from 'react'

// A card shown once its anchor has been hovered, or focused from the
// keyboard, for a moment (the stylesheet's `--ft-hover-card-delay`), and
// hidden as soon as it isn't. It floats over the rows beneath it, so it never
// changes the tree's layout (design, topic 4, "Parameter metadata"), and the
// stylesheet alone shows and hides it, so hovering re-renders nothing. With
// `hideOnClick`, a click on the anchor hides it until the pointer leaves, so
// it doesn't cover what the click shows, or until `showAgainOn` changes, as
// an Evaluate's does when its result arrives: with the pointer still there,
// the card then shows, after the usual delay.
export const HoverCard = ({
  card,
  hideOnClick = false,
  showAgainOn,
  children,
}: {
  card: ReactNode
  hideOnClick?: boolean
  showAgainOn?: unknown
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

// A card's lines, one to a line, with the names in backticks shown as code.
// A parameter's card starts with a title line, and a node's can end with a
// note, a tip about the control set smaller than what the card describes. An
// alert, such as why the control is disabled, comes first, in its colour.
export const CardLines = ({
  lines,
  titled = false,
  note,
  alert,
}: {
  lines: string[]
  titled?: boolean
  note?: string
  alert?: { text: string; colour: string }
}) => (
  <>
    {alert && (
      <span className="ft-hover-card-line ft-hover-card-alert" style={{ color: alert.colour }}>
        {withCode(alert.text)}
      </span>
    )}
    {lines.map((line, index) => (
      <span
        className={
          titled && index === 0 ? 'ft-hover-card-line ft-hover-card-title' : 'ft-hover-card-line'
        }
        key={index}
      >
        {withCode(line)}
      </span>
    ))}
    {note !== undefined && (
      <span className="ft-hover-card-line ft-hover-card-note">{withCode(note)}</span>
    )}
  </>
)

export const withCode = (line: string) =>
  line
    .split('`')
    .map((segment, part) => (part % 2 === 1 ? <code key={part}>{segment}</code> : segment))
