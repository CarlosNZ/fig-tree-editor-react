import { type CustomComponentProps } from 'json-edit-react'
import { brokenIssue, issuesAt } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { type CardLine } from './HoverCard'
import { DisplayBar, type HeaderDisplay } from './DisplayBar'
import { type FragmentDisplay } from './displayData'
import { type EditorTheme } from './editorTheme'
import { withoutFilteredRows } from './nodeRows'
import { NodeToolbar } from './NodeToolbar'
import { cacheLine } from './parameterCard'
import { rowMark } from './revealRow'
import { strings } from './strings'
import { useConversion } from './useConversion'
import { useNodeEditor, useOpenCreated } from './useNodeEditor'
import { useEvaluation } from './useEvaluation'

type FragmentKind = Extract<RowKind, { kind: 'fragment' }>

// A full fragment call (design, topic 1, "Full fragment calls";
// docs-dev/v3-node-anatomy.md, section 2), anchored on the call's own object:
// the DisplayBar, or the toolbar while it is open, then the call's rows, less
// the `fragment` row, which the header shows. Static arguments are a
// flattened payload, so they show as the call's own rows; dynamic ones are a
// `parameters` row with its key.
//
// The raw-JSON editor stands in for the whole body, header included, as on
// an operator node.
export const Fragment = (props: CustomComponentProps<ComponentConfig>) => {
  const { componentProps, nodeData, value, children, originalNode, canEdit, editConfirmRef } = props
  const { setValue } = props
  const { figTree, classification, displayData, issues, nodeIssues, editorTheme, created } =
    componentProps!
  const nodeEditor = useNodeEditor(props)
  const { editor, openToolbar } = nodeEditor
  const { path } = nodeData
  const evaluation = useEvaluation(path, nodeData.fullData, componentProps!)
  useOpenCreated(created, path, canEdit, openToolbar)

  const kind = rowAt(classification, path)?.kind as FragmentKind
  // An unregistered name is looked up nowhere, since it may be anything
  const display = kind.registered ? displayData.fragments[kind.name!] : undefined
  const node = value as Record<string, unknown>
  const broken = brokenIssue(issues, classification, path, node)
  const conversion = useConversion(value, componentProps!, !broken && canEdit, setValue)

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
          name={kind.name}
          display={fragmentHeader(display, editorTheme)}
          card={[
            display?.description,
            cacheLine(path, kind, {
              classification,
              operators: figTree.getOperators(),
              fragments: figTree.getFragments(),
            }),
          ].filter((line): line is CardLine => line !== undefined)}
          broken={broken}
          flagged={issuesAt(nodeIssues, path)}
          editorTheme={editorTheme}
          canonical
          onEdit={canEdit ? () => openToolbar() : undefined}
          conversion={conversion}
          evaluation={evaluation}
        />
      )}
      {withoutFilteredRows(children, classification, path)}
    </div>
  )
}

// A fragment's header (topic 3, "Kinds"): its `FragmentMetadata`, where it
// has one. The button's name already shows the fragment's name, so a fragment
// with no display name shows "Fragment" alone, and one with no colours takes
// the editor's fragment colours, as does a call to no registered fragment.
export const fragmentHeader = (
  display: Omit<FragmentDisplay, 'seeds'> | undefined,
  editorTheme: EditorTheme
): HeaderDisplay => ({
  displayName: display?.displayName ?? strings.FT_FRAGMENT,
  suffix: display?.displayName === undefined ? undefined : strings.FT_FRAGMENT_SUFFIX,
  docUrl: display?.docUrl,
  backgroundColor: display?.backgroundColor ?? editorTheme.fragmentBackground,
  textColor: display?.textColor ?? editorTheme.fragmentText,
})
