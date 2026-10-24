import { type RefObject } from 'react'
import { type JsonData } from 'json-edit-react'
import { AddParameter } from './AddParameter'
import { type brokenIssue } from './attachIssues'
import { rowAt, type RowKind } from './classify'
import { type Shared } from './customNodeDefinitions'
import { FragmentPicker } from './FragmentPicker'
import { NodeTypeSwitch } from './NodeTypeSwitch'
import { OperatorPicker } from './OperatorPicker'
import { addKey, addableKeys } from './parameterOptions'
import { type Path } from './paths'
import { Toolbar } from './Toolbar'
import { type useNodeEditor } from './useNodeEditor'

type NodeKind = Extract<RowKind, { kind: 'operator' | 'fragment' | 'literal' }>

// A node's toolbar (design, topic 3, "Header and toolbar"): the node-type
// switch, the operator or fragment picker, and "Add parameter", then ✓ and ✗.
// It edits a node in full form. A shorthand node's toolbar is handed the node
// lifted to full form, with `lifted`, and its `commit` lowers each change back
// (Shorthand.tsx).

interface NodeToolbarProps {
  node: Record<string, unknown> // in full form
  kind: NodeKind // the node's, in whichever form
  path: Path
  broken: ReturnType<typeof brokenIssue>
  shared: Shared
  editor: ReturnType<typeof useNodeEditor>
  commit?: ReturnType<typeof useNodeEditor>['commit'] // the editor's own by default
  editConfirmRef: RefObject<HTMLButtonElement | null>
  lifted?: Lifted
}

// A shorthand node's, whose toolbar edits it in full form
interface Lifted {
  written: Record<string, unknown> // the node as written, which `literal` quotes
  // The toolbar on the node a node-type switch gives, which the shorthand
  // node's own component shows
  reopen: (creation: { replaced: JsonData }) => void
}

export const NodeToolbar = ({
  node,
  kind,
  path,
  broken,
  shared,
  editor,
  commit = editor.commit,
  editConfirmRef,
  lifted,
}: NodeToolbarProps) => {
  const { figTree, classification, displayData } = shared
  const admits = rowAt(classification, path)?.slot?.admits ?? 'any'

  // Parameters are added once the node names an operator or fragment the
  // editor knows, so a broken node's toolbar offers the picker alone
  const addParameter = () => {
    const context = {
      classification,
      operators: figTree.getOperators(),
      fragments: figTree.getFragments(),
      displayData,
    }
    const keys = addableKeys(node, path, kind, context)
    if (broken || keys === null) return null
    return (
      <AddParameter keys={keys} onAdd={(entry) => commit(addKey(node, entry, kind, context))} />
    )
  }

  const picker = () => {
    if (kind.kind === 'fragment')
      return (
        <FragmentPicker
          figTree={figTree}
          displayData={displayData}
          admits={admits}
          node={node}
          current={broken ? null : kind.name}
          startOpen={editor.created}
          suggestion={
            broken?.code === 'unknown-fragment' ? (broken.suggestion ?? undefined) : undefined
          }
          onSwitch={(next) => commit(next)}
          excludedFragments={shared.excludedFragments}
        />
      )
    // `literal` is grammar rather than an operator, so its kind names nothing
    const current = kind.kind === 'literal' ? 'literal' : kind.operator
    return (
      <OperatorPicker
        figTree={figTree}
        displayData={displayData}
        admits={admits}
        node={node}
        written={lifted?.written}
        current={broken ? null : current}
        startOpen={editor.created}
        suggestion={
          broken?.code === 'unknown-operator' ? (broken.suggestion ?? undefined) : undefined
        }
        onSwitch={(next) => commit(next)}
      />
    )
  }

  return (
    <Toolbar confirm={editor.confirm} revert={editor.revert} editConfirmRef={editConfirmRef}>
      <NodeTypeSwitch
        current={kind.kind === 'fragment' ? 'fragment' : 'operator'}
        node={node}
        path={path}
        shared={shared}
        snapshot={editor.snapshot}
        commit={commit}
        reopen={lifted?.reopen}
      />
      {picker()}
      {addParameter()}
    </Toolbar>
  )
}
