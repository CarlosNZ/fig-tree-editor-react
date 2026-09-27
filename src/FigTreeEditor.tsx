import { useInsertionEffect } from 'react'
import { JsonEditor, type JsonEditorProps } from 'json-edit-react'
import { type FigTree, type Issue } from 'fig-tree-evaluator'
import { injectStyles } from './injectStyles'
import { displayPath } from './paths'

// Expressions are typed `unknown`, as fig-tree's own methods take them: any
// JSON value is an expression, and `validate()` is what says whether it's a
// good one. The remaining props are json-edit-react's, passed straight
// through.
export interface FigTreeEditorProps extends Omit<JsonEditorProps, 'data' | 'setData'> {
  figTree: FigTree
  expression: unknown
  setExpression: (expression: unknown) => void
}

export const FigTreeEditor = ({
  figTree,
  expression,
  setExpression,
  className,
  ...props
}: FigTreeEditorProps) => {
  useInsertionEffect(() => {
    injectStyles()
  }, [])

  // Validated on every render rather than memoised on the expression: the
  // result also depends on the instance's registry, which `updateOptions()`
  // changes without changing the instance's identity.
  const { issues } = figTree.validate(expression)

  return (
    <>
      <JsonEditor
        {...props}
        className={className ? `ft-editor ${className}` : 'ft-editor'}
        data={expression}
        setData={setExpression}
      />
      {issues.length > 0 && <IssueList issues={issues} />}
    </>
  )
}

// TO-DO: replace with the diagnostics UI from the design phase (plan, Phase 9)
const IssueList = ({ issues }: { issues: Issue[] }) => (
  <ul className="ft-issues">
    {issues.map((issue, index) => (
      <li key={index} className={`ft-issue ft-issue-${issue.severity}`}>
        <span className="ft-issue-severity">{issue.severity}</span>
        <code className="ft-issue-path">{displayPath(issue.path) || '(root)'}</code>
        <span className="ft-issue-message">{issue.message}</span>
      </li>
    ))}
  </ul>
)
