import { type CustomComponentProps, type CustomWrapperProps } from 'json-edit-react'
import { type CSSProperties, type ReactNode } from 'react'
import { type ComponentConfig, type Shared } from './customNodeDefinitions'
import { runColour } from './editorTheme'
import { RanTick } from './Icons'
import { type Path } from './paths'
import { plainMark, showsTick } from './runMarks'

// Plain data json-edit-react draws, marked by how the latest evaluation
// reached it (design, topic 7, "How it ran, in the tree"). The mark is an
// attribute, by which the stylesheet dims what never ran, as it dims a node,
// and where it ran, it may show a ✓ (`showsTick`).

// A plain value: its value marked, its key left as it is, as a node's is, and
// its ✓ after it
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
      {showsTick(mark) && <RanTick editorTheme={shared.editorTheme} />}
    </span>
  )
}

// A plain collection, wrapped whole, so the stylesheet can dim its rows and
// show them in full while the pointer is anywhere in it, its key included.
// Its ✓ follows its closing bracket, which json-edit-react draws, so the
// stylesheet draws the ✓ too, in the colour the wrapper gives it.
export const PlainCollection = ({
  nodeData,
  wrapperProps,
  children,
}: CustomWrapperProps<Pick<Shared, 'run' | 'editorTheme'>>) => {
  const { run, editorTheme } = wrapperProps!
  const mark = plainMark(run, nodeData.path)
  const ticked = mark !== undefined && showsTick(mark)
  return (
    <div
      className="ft-plain-collection"
      data-node-run={mark?.status}
      data-ticked={ticked || undefined}
      style={
        ticked
          ? ({ '--ft-tick-colour': runColour('value', editorTheme) } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  )
}
