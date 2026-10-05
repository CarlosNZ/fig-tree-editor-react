import { Box } from '@chakra-ui/react'
import { CardLines, HoverCard, type EditorStatus } from '@fig-tree-editor-react'

// Whether every top-level value of the expression has a fallback, from the
// status's `uncovered`, with a card saying what that means. The check only
// looks for a missing fallback, so a cross can mark an expression that never
// fails, and the badge stays quiet rather than alarming. It shows nothing
// while there are errors, when `uncovered` is null.
export const ShieldedBadge = ({ uncovered }: { uncovered: EditorStatus['uncovered'] }) => {
  if (uncovered === null) return null
  const shielded = uncovered.length === 0
  return (
    // The editor's base font size, so the card is the size of the editor's
    <Box position="absolute" top={1.5} right={4} zIndex={1} fontSize="16px">
      <HoverCard align="end" card={<CardLines titled {...describeCoverage(uncovered)} />}>
        <Box as="span" fontSize="sm" color="gray.600">
          Shielded:&nbsp;
          <Box as="span" fontWeight="bold" color={shielded ? 'green.600' : 'orange.500'}>
            {shielded ? '✓' : '✗'}
          </Box>
        </Box>
      </HoverCard>
    </Box>
  )
}

const describeCoverage = (uncovered: (string | number)[][]) => {
  if (uncovered.length === 0)
    return {
      lines: [
        'Always returns a value',
        'Root-level fallback ensures the expression will never throw',
      ],
    }
  if (uncovered.some((path) => path.length === 0))
    return {
      lines: ['No fallback at the root'],
      note: 'Only a missing fallback is checked, so the expression may never fail',
    }
  const count = uncovered.length === 1 ? '1 value' : `${uncovered.length} values`
  return {
    lines: [
      `No fallback on ${count}`,
      ...uncovered.map((path) => ({ detail: `\`${path.join('.')}\`` })),
    ],
    note: 'Only a missing fallback is checked, so these may never fail',
  }
}
