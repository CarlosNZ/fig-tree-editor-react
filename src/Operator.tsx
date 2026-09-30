import { type CustomComponentProps } from 'json-edit-react'
import { AddParameter } from './AddParameter'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { DisplayBar } from './DisplayBar'
import { withoutFilteredRows } from './nodeRows'
import { NodeTypeSwitch } from './NodeTypeSwitch'
import { OperatorPicker } from './OperatorPicker'
import { operatorDefaultsLine } from './parameterCard'
import { addKey, addableKeys } from './parameterOptions'
import { Toolbar } from './Toolbar'
import { useNodeEditor, useOpenCreated } from './useNodeEditor'

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
  const { figTree, classification, displayData, issues, editorTheme, created } = componentProps!
  const {
    editor,
    created: isNew,
    openToolbar,
    commit,
    confirm,
    revert,
    snapshot,
  } = useNodeEditor(props)
  const { path } = nodeData

  useOpenCreated(created, path, canEdit, openToolbar)
  const row = rowAt(classification, path)
  const kind = row?.kind as OperatorKind
  const display = kind.operator === null ? undefined : displayData.operators[kind.operator]
  const broken = brokenIssue(issuesAt(issues, path))
  const node = value as Record<string, unknown>

  // Parameters are added once the node has an operator the editor knows, so
  // a broken node's toolbar offers the picker alone
  const addParameter = () => {
    const context = {
      operators: figTree.getOperators(),
      fragments: figTree.getFragments(),
      displayData,
      useCache: figTree.getOptions().useCache,
    }
    const keys = addableKeys(node, kind, context)
    if (broken || keys === null) return null
    return (
      <AddParameter keys={keys} onAdd={(entry) => commit(addKey(node, entry, kind, context))} />
    )
  }

  // The operator's description, then what the host sets on every such node
  // that doesn't set its own
  const operatorCard = () => {
    const operator = figTree.getOperators().find(({ name }) => name === kind.operator)
    return [display?.description, operator && operatorDefaultsLine(operator, node)].filter(
      (line): line is string => line !== undefined
    )
  }

  if (editor === 'json') return <div className="ft-node">{originalNode}</div>

  return (
    <div className="ft-node">
      {editor === 'toolbar' ? (
        <Toolbar confirm={confirm} revert={revert} editConfirmRef={editConfirmRef}>
          <NodeTypeSwitch
            current="operator"
            node={node}
            path={path}
            shared={componentProps!}
            snapshot={snapshot}
            commit={commit}
          />
          <OperatorPicker
            figTree={figTree}
            displayData={displayData}
            admits={row?.slot?.admits ?? 'any'}
            node={node}
            current={broken ? null : kind.operator}
            startOpen={isNew}
            suggestion={
              broken?.code === 'unknown-operator' ? (broken.suggestion ?? undefined) : undefined
            }
            // A `literal` belongs to its own definition, so the toolbar
            // can't carry on there
            onSwitch={(next, target) => commit(next, { close: target === 'literal' })}
          />
          {addParameter()}
        </Toolbar>
      ) : (
        <DisplayBar
          name={kind.name}
          display={display}
          card={operatorCard()}
          broken={broken}
          editorTheme={editorTheme}
          onEdit={canEdit ? () => openToolbar() : undefined}
        />
      )}
      {withoutFilteredRows(children, classification, path)}
    </div>
  )
}
