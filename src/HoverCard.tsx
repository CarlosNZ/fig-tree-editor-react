import { useId, type ReactNode } from 'react'

// A card shown while its anchor is hovered or has focus. It floats over the
// rows beneath it, so it never changes the tree's layout (design, topic 4,
// "Parameter metadata"), and the stylesheet alone shows and hides it.
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
