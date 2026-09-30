import { type CustomComponentProps } from 'json-edit-react'
import { AddParameter } from './AddParameter'
import { brokenIssue } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type ComponentConfig } from './customNodeDefinitions'
import { DisplayBar, type HeaderDisplay } from './DisplayBar'
import { type FragmentDisplay } from './displayData'
import { type EditorTheme } from './editorTheme'
import { FragmentPicker } from './FragmentPicker'
import { NodeTypeSwitch } from './NodeTypeSwitch'
import { withoutFilteredRows } from './nodeRows'
import { addKey, addableKeys } from './parameterOptions'
import { strings } from './strings'
import { Toolbar } from './Toolbar'
import { useNodeEditor, useOpenCreated } from './useNodeEditor'

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
  const kind = row?.kind as FragmentKind
  // An unregistered name is looked up nowhere, since it may be anything
  const hints = kind.registered ? displayData.fragments[kind.name!] : undefined
  const node = value as Record<string, unknown>
  const broken = brokenIssue(issues, classification, path, node)

  // Arguments are added once the call names a fragment the editor knows, so a
  // broken call's toolbar offers the picker alone
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

  if (editor === 'json') return <div className="ft-node">{originalNode}</div>

  return (
    <div className="ft-node">
      {editor === 'toolbar' ? (
        <Toolbar confirm={confirm} revert={revert} editConfirmRef={editConfirmRef}>
          <NodeTypeSwitch
            current="fragment"
            node={node}
            path={path}
            shared={componentProps!}
            snapshot={snapshot}
            commit={commit}
          />
          <FragmentPicker
            figTree={figTree}
            displayData={displayData}
            admits={row?.slot?.admits ?? 'any'}
            node={node}
            current={broken ? null : kind.name}
            startOpen={isNew}
            suggestion={
              broken?.code === 'unknown-fragment' ? (broken.suggestion ?? undefined) : undefined
            }
            onSwitch={(next) => commit(next)}
          />
          {addParameter()}
        </Toolbar>
      ) : (
        <DisplayBar
          name={kind.name}
          display={fragmentHeader(hints, editorTheme)}
          card={hints?.description === undefined ? [] : [hints.description]}
          broken={broken}
          editorTheme={editorTheme}
          onEdit={canEdit ? () => openToolbar() : undefined}
        />
      )}
      {withoutFilteredRows(children, classification, path)}
    </div>
  )
}

// A fragment's header (topic 3, "Kinds"): its `FragmentHints`, where it has
// them. The button's name already shows the fragment's name, so a fragment
// with no display name shows "Fragment" alone, and one with no colours takes
// the editor's fragment colours, as does a call to no registered fragment.
export const fragmentHeader = (
  hints: FragmentDisplay | undefined,
  editorTheme: EditorTheme
): HeaderDisplay => ({
  displayName: hints?.displayName ?? strings.FT_FRAGMENT,
  suffix: hints?.displayName === undefined ? undefined : strings.FT_FRAGMENT_SUFFIX,
  docUrl: hints?.docUrl,
  backgroundColor: hints?.backgroundColor ?? editorTheme.fragmentBackground,
  textColor: hints?.textColor ?? editorTheme.fragmentText,
})
