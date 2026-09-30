import { type CustomComponentProps } from 'json-edit-react'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { DisplayBar } from './DisplayBar'
import { withoutFilteredRows } from './nodeRows'
import { OperatorPicker } from './OperatorPicker'
import { Toolbar } from './Toolbar'
import { useNodeEditor } from './useNodeEditor'

type OperatorKind = Extract<RowKind, { kind: 'operator' }>

// A full operator node (design, topic 1, "Full operator nodes";
// docs-dev/v3-node-anatomy.md, section 1), anchored on the node's own object:
// the DisplayBar, or the toolbar while it is open, then the node's rows, less
// the `operator` row, which the header shows. json-edit-react's header row
// stays above it, for the key, collapsing and the edit tools.
//
// The raw-JSON editor stands in for the whole body, header included: the
// operator is in the JSON, so a header above it would show the saved one
// while another is typed.
export const Operator = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, value, children, originalNode, canEdit, editConfirmRef } = props
  const { figTree, classification, displayData, issues, editorTheme } = componentProps!
  const { editor, openToolbar, commit, confirm, revert } = useNodeEditor(props)
  const { path } = nodeData
  const row = rowAt(classification, path)
  const kind = row?.kind as OperatorKind
  const display = kind.operator === null ? undefined : displayData.operators[kind.operator]
  const broken = brokenIssue(issuesAt(issues, path))

  if (editor === 'json') return <div className="ft-node">{originalNode}</div>

  return (
    <div className="ft-node">
      {editor === 'toolbar' ? (
        <Toolbar confirm={confirm} revert={revert} editConfirmRef={editConfirmRef}>
          <OperatorPicker
            figTree={figTree}
            displayData={displayData}
            admits={row?.slot?.admits ?? 'any'}
            node={value as Record<string, unknown>}
            current={broken ? null : kind.operator}
            suggestion={
              broken?.code === 'unknown-operator' ? (broken.suggestion ?? undefined) : undefined
            }
            // A `literal` belongs to its own definition, so the toolbar
            // can't carry on there
            onSwitch={(next, target) => commit(next, { close: target === 'literal' })}
          />
        </Toolbar>
      ) : (
        <DisplayBar
          name={kind.name}
          display={display}
          broken={broken}
          editorTheme={editorTheme}
          onEdit={canEdit ? openToolbar : undefined}
        />
      )}
      {withoutFilteredRows(children, classification, path)}
    </div>
  )
}
