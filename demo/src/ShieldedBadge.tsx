import { Box } from '@chakra-ui/react'
import { CardLines, HoverCard, type CardLine, type EditorStatus } from '@fig-tree-editor-react'
import { type CoverageFinding } from 'fig-tree-evaluator'

// Whether nothing in the expression can fail without a fallback to catch it,
// from the status's `coverage`, with a card listing each failure nothing
// catches. It shows nothing while there are errors, when `coverage` is null.
export const ShieldedBadge = ({ coverage }: { coverage: EditorStatus['coverage'] }) => {
  if (coverage === null) return null
  const { uncovered } = coverage
  const shielded = uncovered.length === 0
  return (
    // The editor's base font size, so the card is the size of the editor's
    <Box position="absolute" top={1.5} right={4} zIndex={1} fontSize="16px">
      <HoverCard
        align="end"
        card={
          <>
            <CardLines titled lines={summarise(uncovered.length)} />
            <FindingSection title="Uncaught" findings={uncovered} />
          </>
        }
      >
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

const summarise = (uncovered: number) =>
  uncovered > 0
    ? [
        'May throw',
        `${plural(uncovered, 'failure')} with no fallback to catch ${uncovered === 1 ? 'it' : 'them'}`,
      ]
    : ['Always returns a value', 'Nothing can fail without a fallback to catch it']

const FindingSection = ({ title, findings }: { title: string; findings: CoverageFinding[] }) =>
  findings.length > 0 && (
    <Box as="span" display="block" mt="0.8em">
      <CardLines titled lines={[`${title} (${findings.length})`, ...findings.flatMap(describe)]} />
    </Box>
  )

// A finding's headline, where it starts and its code, with its other fields
// as details under it
const describe = ({
  path,
  code,
  message,
  certainty,
  operator,
  parameter,
  fragment,
  fragmentPath,
}: CoverageFinding): CardLine[] => {
  const details: CardLine[] = [{ detail: `${message} (${certainty})` }]
  if (operator !== undefined || parameter !== undefined)
    details.push({
      detail: [operator && `operator \`${operator}\``, parameter && `parameter \`${parameter}\``]
        .filter(Boolean)
        .join(', '),
    })
  if (fragment !== undefined)
    details.push({
      detail: `in fragment \`${fragment}\`${fragmentPath ? ` at \`${showPath(fragmentPath)}\`` : ''}`,
    })
  return [`\`${showPath(path)}\` · \`${code}\``, ...details]
}

const showPath = (path: (string | number)[]) => (path.length === 0 ? 'root' : path.join('.'))

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
