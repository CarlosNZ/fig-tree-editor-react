import { useId, type ReactNode } from 'react'

// A card shown once its anchor has been hovered or focused for a moment (the
// stylesheet's `--ft-hover-card-delay`), and hidden as soon as it isn't. It
// floats over the rows beneath it, so it never changes the tree's layout
// (design, topic 4, "Parameter metadata"), and the stylesheet alone shows and
// hides it, so hovering re-renders nothing.
export const HoverCard = ({ card, children }: { card: ReactNode; children: ReactNode }) => {
  const id = useId()
  if (card === undefined || card === null || card === '') return children
  return (
    <span className="ft-hover-card-anchor" aria-describedby={id}>
      {children}
      <span className="ft-hover-card" role="tooltip" id={id}>
        {card}
      </span>
    </span>
  )
}

// A card's lines, one to a line, with the names in backticks shown as code.
// A parameter's card starts with a title line.
export const CardLines = ({ lines, titled = false }: { lines: string[]; titled?: boolean }) =>
  lines.map((line, index) => (
    <span
      className={
        titled && index === 0 ? 'ft-hover-card-line ft-hover-card-title' : 'ft-hover-card-line'
      }
      key={index}
    >
      {line
        .split('`')
        .map((segment, part) => (part % 2 === 1 ? <code key={part}>{segment}</code> : segment))}
    </span>
  ))
