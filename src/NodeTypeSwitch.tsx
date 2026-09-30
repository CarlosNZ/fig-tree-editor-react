import { type JsonData } from 'json-edit-react'
import { type Shared } from './customNodeDefinitions'
import { type Path } from './paths'
import { Select } from './Select'
import { strings } from './strings'
import { nodeTypes, switchNodeType, type NodeType } from './switchNodeType'

// The toolbar's node-type switch (design, topic 3, "Header and toolbar"), the
// first of its controls: Operator, Fragment where one can fit, and Value.
// Choosing the current type again changes nothing.
//
// A switch to the other node type hands the row to the other definition,
// whose component can't take over this toolbar, so the switch commits and
// closes, marking the new node so that it opens its own toolbar on its picker
// (topic 2, "Node lifecycle"). The mark carries the snapshot this toolbar
// opened on, so ✗ there restores the node as it was before the session. A
// switch to Value commits and closes.

interface NodeTypeSwitchProps {
  current: 'operator' | 'fragment'
  node: Record<string, unknown>
  path: Path
  shared: Shared
  snapshot: () => JsonData
  commit: (next: JsonData, options: { close: boolean }) => void
}

const LABELS: Record<NodeType, string> = {
  operator: strings.FT_NODE_TYPE_OPERATOR,
  fragment: strings.FT_NODE_TYPE_FRAGMENT,
  value: strings.FT_NODE_TYPE_VALUE,
}

export const NodeTypeSwitch = ({
  current,
  node,
  path,
  shared,
  snapshot,
  commit,
}: NodeTypeSwitchProps) => {
  const context = {
    classification: shared.classification,
    operators: shared.figTree.getOperators(),
    fragments: shared.figTree.getFragments(),
    displayData: shared.displayData,
    defaultOperators: shared.defaultOperators,
    defaultFragment: shared.defaultFragment,
  }

  const switchTo = (target: NodeType) => {
    const next = switchNodeType(node, target, path, context)
    if (target !== 'value')
      shared.created.current = { path, node: next as object, replaced: snapshot() }
    commit(next, { close: true })
  }

  return (
    <span className="ft-node-type">
      <Select
        className="ft-node-type-switch"
        options={nodeTypes(path, context).map((type) => ({ label: LABELS[type], value: type }))}
        selected={current}
        setSelected={({ value }) => {
          if (value !== current) switchTo(value)
        }}
      />
      <span className="ft-node-type-colon">:</span>
    </span>
  )
}
