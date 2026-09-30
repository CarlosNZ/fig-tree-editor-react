import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  JsonEditor,
  type CustomComponentProps,
  type JsonData,
  type JsonEditorHandle,
} from 'json-edit-react'
import { createRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useNodeEditor } from '../src/useNodeEditor'

// A node using the hook as the Operator does, with one toolbar action,
// "Increment", which stands in for the operator picker's commits
const Node = (props: CustomComponentProps) => {
  const { editor, openToolbar, commit, confirm, revert } = useNodeEditor(props)
  const node = props.value as { count: number }
  if (editor === 'json') return <div data-testid="json">{props.originalNode}</div>
  return (
    <div>
      {editor === 'toolbar' ? (
        <div data-testid="toolbar">
          <button onClick={() => commit({ ...node, count: node.count + 1 })}>Increment</button>
          <button
            ref={props.editConfirmRef as React.RefObject<HTMLButtonElement>}
            onClick={confirm}
          >
            Done
          </button>
          <button onClick={revert}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => openToolbar()}>Open toolbar</button>
      )}
      {props.children}
    </div>
  )
}

const definitions = [
  {
    condition: ({ path }: { path: (string | number)[] }) => path.length === 1 && path[0] === 'node',
    component: Node,
    showOnEdit: true,
    passOriginalNode: true,
  },
]

// The latest data, as the host holds it
let latest: { node: { count: number }; other: string }

const setup = () => {
  const editorRef = createRef<JsonEditorHandle>()
  const Host = () => {
    const [data, setData] = useState({ node: { count: 0 }, other: 'x' })
    latest = data
    return (
      <JsonEditor
        data={data}
        setData={(next: JsonData) => setData(next as typeof data)}
        customNodeDefinitions={definitions}
        editorRef={editorRef}
      />
    )
  }
  render(<Host />)
  return editorRef
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const toolbar = () => screen.queryByTestId('toolbar')
const openWithActions = (count: number) => {
  click('Open toolbar')
  for (let i = 0; i < count; i++) click('Increment')
}

// json-edit-react's window listener attaches shortly after a session opens
const press = async (key: string) => {
  await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
  fireEvent.keyDown(window, { key })
}

describe('a node with two editors', () => {
  it("opens the toolbar from the pencil, and raw JSON from json-edit-react's ✎", () => {
    setup()
    click('Open toolbar')
    expect(toolbar()).toBeInTheDocument()
    click('Done')
    expect(toolbar()).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1])
    expect(screen.getByTestId('json').querySelector('textarea')).toBeInTheDocument()
    expect(toolbar()).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Each still opens its own after the other's session
    click('Open toolbar')
    expect(toolbar()).toBeInTheDocument()
  })

  it('commits each action and keeps the toolbar open, without remounting it', () => {
    setup()
    click('Open toolbar')
    const opened = toolbar()
    click('Increment')
    click('Increment')
    expect(latest.node.count).toBe(2)
    expect(toolbar()).toBe(opened)
  })

  it('keeps the changes on ✓', () => {
    setup()
    openWithActions(2)
    click('Done')
    expect(toolbar()).not.toBeInTheDocument()
    expect(latest.node.count).toBe(2)
  })

  it('reverts to the value it opened on, on ✗', () => {
    setup()
    openWithActions(2)
    click('Cancel')
    expect(toolbar()).not.toBeInTheDocument()
    expect(latest.node.count).toBe(0)
  })

  it('keeps the changes on Enter, and reverts on Esc', async () => {
    setup()
    openWithActions(1)
    await press('Enter')
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(latest.node.count).toBe(1)

    openWithActions(2)
    await press('Escape')
    await waitFor(() => expect(toolbar()).not.toBeInTheDocument())
    expect(latest.node.count).toBe(1)
  })

  it('keeps the changes when another row opens', () => {
    const editorRef = setup()
    openWithActions(1)
    act(() => {
      editorRef.current!.startEdit({ path: ['other'] })
    })
    expect(toolbar()).not.toBeInTheDocument()
    expect(latest.node.count).toBe(1)
  })

  it("closes on the handle's confirm() and cancel(), keeping the changes", () => {
    const editorRef = setup()
    openWithActions(1)
    act(() => editorRef.current!.confirm())
    expect(toolbar()).not.toBeInTheDocument()
    expect(latest.node.count).toBe(1)

    openWithActions(1)
    act(() => editorRef.current!.cancel())
    expect(toolbar()).not.toBeInTheDocument()
    expect(latest.node.count).toBe(2)
  })
})
