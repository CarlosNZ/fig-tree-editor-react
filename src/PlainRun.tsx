import { type CustomComponentProps, type CustomWrapperProps } from 'json-edit-react'
import { type ReactNode } from 'react'
import { type ComponentConfig, type Shared } from './customNodeDefinitions'
import { type Path } from './paths'
import { plainMark } from './runMarks'

// Plain data json-edit-react draws, marked by how the latest evaluation
// reached it (design, topic 7, "How it ran, in the tree"). The mark is an
// attribute, by which the stylesheet dims what never ran, as it dims a node.

// A plain value: its value marked, its key left as it is, as a node's is
export const PlainRun = ({
  componentProps,
  nodeData,
  originalNode,
}: CustomComponentProps<ComponentConfig>) => (
  <PlainValue path={nodeData.path} shared={componentProps!}>
    {originalNode}
  </PlainValue>
)

export const PlainValue = ({
  path,
  shared,
  children,
}: {
  path: Path
  shared: Shared
  children: ReactNode
}) => {
  const mark = plainMark(shared.run, path)
  if (mark === undefined) return children
  return (
    <span className="ft-plain-value" data-node-run={mark.status}>
      {children}
    </span>
  )
}

// A plain collection, wrapped whole, so the stylesheet can dim its rows and
// show them in full while the pointer is anywhere in it, its key included
export const PlainCollection = ({
  nodeData,
  wrapperProps,
  children,
}: CustomWrapperProps<Pick<Shared, 'run'>>) => (
  <div
    className="ft-plain-collection"
    data-node-run={plainMark(wrapperProps!.run, nodeData.path)?.status}
  >
    {children}
  </div>
)
