import { type CustomComponentProps } from 'json-edit-react'
import { type Issue } from 'fig-tree-evaluator'
import { flaggedIssues } from './attachIssues'
import { type ComponentConfig } from './customNodeDefinitions'
import { warningText, type EditorTheme } from './editorTheme'
import { HoverCard } from './HoverCard'
import { PlainValue } from './PlainRun'
import { rowMark } from './revealRow'
import { strings } from './strings'

// How issues show on rows (design, topic 7, "Where issues attach"). A row is
// tinted by its most severe issue, and its issues float beneath it in a card
// while it is hovered, so they never change the tree's layout. A node's own
// issues are a flag on its header's line, which has room for one. `issues`
// comes from `flaggedIssues`, most severe first, with no hints.

// A node's flag: the most severe issue's message, cut to the space left on
// the line, then "+1" and so on for the rest, with every one listed on hover.
// An error's flag is solid and a warning's outlined, so a warning reads as
// less urgent.
export const IssueFlag = ({
  issues,
  editorTheme,
}: {
  issues: readonly Issue[]
  editorTheme: EditorTheme
}) => {
  if (issues.length === 0) return null
  const [first, ...rest] = issues
  return (
    <span className="ft-flag-anchor">
      <HoverCard card={<CardIssues issues={issues} editorTheme={editorTheme} />}>
        <span className="ft-flag" style={flagStyle(first.severity, editorTheme)}>
          {first.message}
        </span>
        {rest.length > 0 && (
          <span className="ft-flag-more">{strings.FT_FLAG_MORE(rest.length)}</span>
        )}
      </HoverCard>
    </span>
  )
}

// A row's card, listing its issues, which the stylesheet shows while the row
// is hovered, as a hover card is shown
export const IssueCard = ({
  issues,
  editorTheme,
}: {
  issues: readonly Issue[]
  editorTheme: EditorTheme
}) =>
  issues.length > 0 && (
    <span className="ft-hover-card ft-issue-card" role="tooltip">
      <CardIssues issues={issues} editorTheme={editorTheme} />
    </span>
  )

// Every issue, with its severity
const CardIssues = ({
  issues,
  editorTheme,
}: {
  issues: readonly Issue[]
  editorTheme: EditorTheme
}) =>
  issues.map((issue, index) => (
    <span className="ft-hover-card-line ft-flag-issue" key={index}>
      <span className="ft-flag-severity" style={flagStyle(issue.severity, editorTheme)}>
        {SEVERITY[issue.severity]}
      </span>
      <span>{issue.message}</span>
    </span>
  ))

const SEVERITY = {
  error: strings.FT_SEVERITY_ERROR,
  warning: strings.FT_SEVERITY_WARNING,
  hint: strings.FT_SEVERITY_HINT,
}

const flagStyle = (severity: Issue['severity'], { error, warning }: EditorTheme) =>
  severity === 'error'
    ? { backgroundColor: error, color: 'white', borderColor: error }
    : { backgroundColor: 'white', color: warningText(warning), borderColor: warning }

// A row json-edit-react draws, with its issues' card: beneath a value, or, on
// a collection, beneath json-edit-react's header line, at the top of its
// rows, which the editor's component draws. Only rows with an error or a
// warning take this component.
export const Flagged = ({
  componentProps,
  nodeData,
  children,
  originalNode,
  indent,
}: CustomComponentProps<ComponentConfig>) => {
  const { issues, editorTheme } = componentProps!
  const card = <IssueCard issues={flaggedIssues(issues, nodeData.path)} editorTheme={editorTheme} />
  if (children === undefined)
    return (
      <span className="ft-flagged" {...rowMark(nodeData.path)}>
        <PlainValue path={nodeData.path} shared={componentProps!}>
          {originalNode}
        </PlainValue>
        {card}
      </span>
    )
  return (
    <>
      <div
        className="ft-flag-line"
        style={{ marginLeft: `${indent / 2}em` }}
        {...rowMark(nodeData.path)}
      >
        {card}
      </div>
      {children}
    </>
  )
}
