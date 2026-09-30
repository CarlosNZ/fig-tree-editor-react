import { type CustomComponentProps } from 'json-edit-react'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { DisplayBar } from './DisplayBar'
import { withoutFilteredRows } from './nodeRows'

type OperatorKind = Extract<RowKind, { kind: 'operator' }>

// A full operator node (design, topic 1, "Full operator nodes";
// docs-dev/v3-node-anatomy.md, section 1), anchored on the node's own object:
// the DisplayBar, then the node's rows, less the `operator` row, which the
// DisplayBar shows. json-edit-react's header row stays above it, for the key,
// collapsing and the edit tools.
export const Operator = ({
  componentProps,
  nodeData,
  children,
}: CustomComponentProps<ComponentConfig>) => {
  const { classification, displayData, issues, editorTheme } = componentProps!
  const { path } = nodeData
  const kind = rowAt(classification, path)?.kind as OperatorKind
  const display = kind.operator === null ? undefined : displayData.operators[kind.operator]

  return (
    <div className="ft-node">
      <DisplayBar
        name={kind.name}
        display={display}
        broken={brokenIssue(issuesAt(issues, path))}
        editorTheme={editorTheme}
      />
      {withoutFilteredRows(children, classification, path)}
    </div>
  )
}
