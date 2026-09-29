import { useInsertionEffect, useMemo } from 'react'
import { JsonEditor, type JsonEditorProps } from 'json-edit-react'
import { type FigTree, type Issue } from 'fig-tree-evaluator'
import { type CategoryHintsProp, type OperatorHintsProp } from './displayData'
import { layerTheme, type EditorTheme } from './editorTheme'
import { injectStyles } from './injectStyles'
import { displayPath } from './paths'
import { strings } from './strings'

// Expressions are typed `unknown`, as fig-tree's own methods take them: any
// JSON value is an expression, and `validate()` is what says whether it's a
// good one. The rest are json-edit-react's props, less those the editor
// replaces with its own: passing one of those is a type error.
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
  setExpression: (expression: unknown) => void
  operatorHints?: OperatorHintsProp
  categoryHints?: CategoryHintsProp
  editorTheme?: Partial<EditorTheme>
}

export const FigTreeEditor = ({
  figTree,
  expression,
  setExpression,
  // TO-DO: hand these to the editor's components (plan, 4.4)
  operatorHints: _operatorHints,
  categoryHints: _categoryHints,
  editorTheme: _editorTheme,
  className,
  theme,
  ...props
}: FigTreeEditorProps) => {
  useInsertionEffect(() => {
    injectStyles()
  }, [])

  // Validated on every render rather than memoised on the expression: the
  // result also depends on the instance's registry, which `updateOptions()`
  // changes without changing the instance's identity.
  const { issues } = figTree.validate(expression)

  const layeredTheme = useMemo(() => layerTheme(theme), [theme])

  return (
    <>
      <JsonEditor
        {...editorDefaults}
        {...props}
        className={className ? `ft-editor ${className}` : 'ft-editor'}
        theme={layeredTheme}
        data={expression}
        setData={setExpression}
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
