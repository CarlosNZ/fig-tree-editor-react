import { type CustomComponentProps } from 'json-edit-react'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { type CardLine } from './HoverCard'
import { DisplayBar } from './DisplayBar'
import { withoutFilteredRows } from './nodeRows'
import { NodeToolbar } from './NodeToolbar'
import { cacheLine, operatorDefaultsLine } from './parameterCard'
import { rowMark } from './revealRow'
import { modifierNames, otherSpelling } from './spelling'
import { strings } from './strings'
import { useConversion } from './useConversion'
import { useNodeEditor, useOpenCreated } from './useNodeEditor'
import { useEvaluation } from './useEvaluation'

type OperatorKind = Extract<RowKind, { kind: 'operator' | 'literal' }>

// A full operator node (design, topic 1, "Full operator nodes";
// docs-dev/v3-node-anatomy.md, sections 1 and 6), `literal` included, anchored
// on the node's own object: the DisplayBar, or the toolbar while it is open,
// then the node's rows, less the `operator` row, which the header shows.
// json-edit-react's header row stays above it, for the key, collapsing and the
// edit tools.
//
// The raw-JSON editor stands in for the whole body, header included: the
// operator is in the JSON, so a header above it would show the saved one
// while another is typed.
export const Operator = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, value, children, originalNode, canEdit, editConfirmRef } = props
  const { setValue, keyboardControls } = props
  const { figTree, classification, displayData, issues, nodeIssues, editorTheme, created } =
    componentProps!
  const nodeEditor = useNodeEditor(props)
  const { editor, openToolbar } = nodeEditor
  const { path } = nodeData
  const evaluation = useEvaluation(path, nodeData.fullData, componentProps!)

  useOpenCreated(created, path, canEdit, openToolbar)
  const kind = rowAt(classification, path)?.kind as OperatorKind
  // `literal` is grammar rather than an operator, so its kind names nothing,
  // and its display data is under its own name
  const operatorName = kind.kind === 'literal' ? 'literal' : kind.operator
  const written = kind.kind === 'literal' ? 'literal' : kind.name
  const display = operatorName === null ? undefined : displayData.operators[operatorName]
  const node = value as Record<string, unknown>
  const broken = brokenIssue(issues, classification, path, node)
  const conversion = useConversion(value, componentProps!, !broken && canEdit, setValue)

  // Where the operator has an alias, a modifier-click on the button writes
  // the other spelling (design, topic 2, "Name or alias")
  const operator = figTree.getOperators().find(({ name }) => name === operatorName)
  const spelling = otherSpelling(operator, written)
  const respell =
    canEdit && !broken && spelling !== undefined
      ? () => setValue({ ...node, operator: spelling })
      : undefined

  // The operator's description, whether its cache is in force, then what the
  // host sets on every such node that doesn't set its own
  const operatorCard = () =>
    [
      display?.description,
      cacheLine(path, kind, {
        classification,
        operators: figTree.getOperators(),
        fragments: figTree.getFragments(),
      }),
      operator && operatorDefaultsLine(operator, node),
    ].filter((line): line is CardLine => line !== undefined)

  if (editor === 'json')
    return (
      <div className="ft-node" {...rowMark(path)}>
        {originalNode}
      </div>
    )

  return (
    <div className="ft-node" {...rowMark(path)} data-node-run={evaluation.mark?.status}>
      {editor === 'toolbar' ? (
        <NodeToolbar
          node={node}
          kind={kind}
          path={path}
          broken={broken}
          shared={componentProps!}
          editor={nodeEditor}
          editConfirmRef={editConfirmRef}
        />
      ) : (
        <DisplayBar
          name={written}
          display={display}
          card={operatorCard()}
          returns={operator?.returns}
          cardNote={
            respell &&
            strings.FT_CARD_RESPELL(modifierNames(keyboardControls.clipboardModifier), spelling!)
          }
          broken={broken}
          flagged={issuesAt(nodeIssues, path)}
          editorTheme={editorTheme}
          onEdit={canEdit ? () => openToolbar() : undefined}
          onRespell={respell}
          respellModifiers={keyboardControls.clipboardModifier}
          conversion={conversion}
          evaluation={evaluation}
        />
      )}
      {withoutFilteredRows(children, classification, path)}
    </div>
  )
}
