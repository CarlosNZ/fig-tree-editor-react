import { useEffect, useInsertionEffect, useMemo } from 'react'
import { JsonEditor, type JsonEditorProps } from 'json-edit-react'
import { type FigTree, type Issue } from 'fig-tree-evaluator'
import { classify } from './classify'
import { customNodeDefinitions } from './customNodeDefinitions'
import { buildDisplayData, type OperatorHintsProp } from './displayData'
import { layerTheme } from './editorTheme'
import { fillAndTidy } from './fillAndTidy'
import { injectStyles } from './injectStyles'
import { displayPath } from './paths'
import { strings } from './strings'
import { useStableValue } from './useStableValue'

// Expressions are typed `unknown`, as fig-tree's own methods take them: any
// JSON value is an expression, and `validate()` is what says whether it's a
// good one. The rest are json-edit-react's props, less those the editor
// replaces with its own: passing one of those is a type error.
//
// Every change reaches `setExpression`, complete. A write the author didn't
// make, filling in an expression that arrived from outside, is marked
// `autoUpdate`, so a host keeping history can record it in place (`useUndo`'s
// `replace`) rather than as a step.
export interface SetExpressionOptions {
  autoUpdate?: boolean
}

export interface FigTreeEditorProps extends Omit<
  JsonEditorProps,
  | 'data'
  | 'setData'
  | 'allowTypeSelection'
  | 'newKeyOptions'
  | 'defaultValue'
  | 'customNodeDefinitions'
> {
  figTree: FigTree
  expression: unknown
  setExpression: (expression: unknown, options?: SetExpressionOptions) => void
  operatorHints?: OperatorHintsProp
}

export const FigTreeEditor = ({
  figTree,
  expression,
  setExpression,
  operatorHints,
  className,
  theme,
  ...props
}: FigTreeEditorProps) => {
  useInsertionEffect(() => {
    injectStyles()
  }, [])

  // Everything below is worked out on every render rather than memoised on
  // the expression: it also depends on the instance's registry, which
  // `updateOptions()` changes without changing the instance's identity. What
  // components receive keeps its identity while its content is unchanged, so
  // the definitions change only when a row's kind, slot or scope does, which
  // has to re-render every row (design, topic 1, finding 6).
  const operators = figTree.getOperators()
  const fragments = figTree.getFragments()
  const displayData = useStableValue(buildDisplayData({ operators, fragments, operatorHints }))

  // An expression, filled in and tidied (the fill-in step). The issues are
  // the ones `fillAndTidy`'s typo guard reads.
  const fill = (value: unknown, issues = figTree.validate(value).issues) =>
    fillAndTidy(value, { operators, fragments, displayData, issues }).expression

  // The editor shows the expression as it writes it. One that arrives
  // incomplete or out of order (a load, an undo, the host's own change, or a
  // registry that now declares more) is written back once, marked; one that
  // needs nothing produces no write, so re-rendering never re-emits.
  const arrivalIssues = figTree.validate(expression).issues
  const filled = fill(expression, arrivalIssues)
  const changed = filled !== expression
  const stableFilled = useStableValue(filled)
  const shown = changed ? stableFilled : expression
  const issues = changed ? figTree.validate(shown).issues : arrivalIssues

  // `setExpression` is left out on purpose: a host's inline setter is new on
  // every render, and the write must happen once per change, not per render
  useEffect(() => {
    if (changed) setExpression(stableFilled, { autoUpdate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, stableFilled])

  const classification = useStableValue(classify(shown, { operators, fragments }))
  const definitions = useMemo(
    () => customNodeDefinitions({ figTree, classification, displayData }),
    [figTree, classification, displayData]
  )

  const layeredTheme = useMemo(() => layerTheme(theme), [theme])

  return (
    <>
      <JsonEditor
        {...editorDefaults}
        {...props}
        className={className ? `ft-editor ${className}` : 'ft-editor'}
        theme={layeredTheme}
        customNodeDefinitions={definitions}
        data={shown}
        setData={(data) => setExpression(fill(data))}
      />
      {issues.length > 0 && <IssueList issues={issues} />}
    </>
  )
}

// json-edit-react props the editor sets, which a host can override. They
// change only how the tree looks.
const editorDefaults = {
  showArrayIndexes: false,
  indent: 2,
  collapse: 2,
  stringTruncateLength: 100,
} satisfies Partial<JsonEditorProps>

const severityLabel = {
  error: strings.FT_SEVERITY_ERROR,
  warning: strings.FT_SEVERITY_WARNING,
  hint: strings.FT_SEVERITY_HINT,
}

// TO-DO: replace with the diagnostics UI from the design phase (plan, Phase 10)
const IssueList = ({ issues }: { issues: Issue[] }) => (
  <ul className="ft-issues">
    {issues.map((issue, index) => (
      <li key={index} className={`ft-issue ft-issue-${issue.severity}`}>
        <span className="ft-issue-severity">{severityLabel[issue.severity]}</span>
        <code className="ft-issue-path">{displayPath(issue.path) || strings.FT_ROOT_PATH}</code>
        <span className="ft-issue-message">{issue.message}</span>
      </li>
    ))}
  </ul>
)
