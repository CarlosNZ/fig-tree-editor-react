import { useEffect } from 'react'
import { type CustomComponentProps } from 'json-edit-react'
import { AddParameter } from './AddParameter'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { DisplayBar } from './DisplayBar'
import { withoutFilteredRows } from './nodeRows'
import { OperatorPicker } from './OperatorPicker'
import { operatorDefaultsLine } from './parameterCard'
import { addableKeys, getNewKeyValue } from './parameterOptions'
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
  const { figTree, classification, displayData, issues, editorTheme, created } = componentProps!
  const { editor, created: isNew, openToolbar, commit, confirm, revert } = useNodeEditor(props)
  const { path } = nodeData

  // A node the type dropdown has just created opens on its picker, once
  useEffect(() => {
    const mark = created.current
    if (!canEdit || mark === null || !samePath(mark.path, path)) return
    created.current = null
    openToolbar({ replaced: mark.replaced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const row = rowAt(classification, path)
  const kind = row?.kind as OperatorKind
  const display = kind.operator === null ? undefined : displayData.operators[kind.operator]
  const broken = brokenIssue(issuesAt(issues, path))
  const node = value as Record<string, unknown>

  // Parameters are added once the node has an operator the editor knows, so
  // a broken node's toolbar offers the picker alone
  const addParameter = () => {
    const operators = figTree.getOperators()
    const keys = addableKeys(node, kind, { operators })
    if (broken || keys === null) return null
    const context = { operators, displayData, useCache: figTree.getOptions().useCache }
    return (
      <AddParameter
        keys={keys}
        onAdd={(key) => commit({ ...node, [key]: getNewKeyValue(key, kind, context) })}
      />
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

const samePath = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((segment, index) => segment === b[index])
