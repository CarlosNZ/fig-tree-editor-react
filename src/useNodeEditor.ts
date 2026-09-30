import { useEffect, useRef, useState } from 'react'
import { useKeyboardListener, type CustomComponentProps, type JsonData } from 'json-edit-react'

// A full node's two editors (design, topic 2, "Two editors per node" and
// "Commit semantics"): the toolbar, opened by the DisplayBar's pencil, and
// json-edit-react's raw-JSON editor, opened by its ✎. Both run in the row's
// one json-edit-react edit session, so which one shows is the component's own
// state. It is raw JSON unless the pencil asked for the toolbar, since
// json-edit-react opens sessions without the component (its ✎,
// `editorRef.startEdit`), and it returns to raw JSON whenever the session
// ends.
//
// The toolbar's changes are live. Each is an ordinary commit through
// `setValue`, which closes the session, so the toolbar reopens it at once, in
// the same handler: the row never renders between the two, and the mode
// holds. ✓ and Enter close it keeping the changes, ✗ and Esc commit the value
// it opened on, and every other end (another row opening, the handle's
// `confirm()` or `cancel()`) keeps them.

export type EditorMode = 'toolbar' | 'json'

type SessionProps = Pick<
  CustomComponentProps,
  'value' | 'isEditing' | 'setIsEditing' | 'setValue' | 'handleEdit' | 'handleKeyboard'
>

export const useNodeEditor = ({
  value,
  isEditing,
  setIsEditing,
  setValue,
  handleEdit,
  handleKeyboard,
}: SessionProps) => {
  const [mode, setMode] = useState<EditorMode>('json')
  // Whether the toolbar opened on a node the type dropdown just created, so
  // its picker opens with it
  const [created, setCreated] = useState(false)
  const snapshot = useRef<JsonData>(value)

  // Reset when the session closes: on the change from open to closed only,
  // since an effect run again while it's still closed (StrictMode runs each
  // twice on mount) would undo the toolbar a new node has just opened
  const wasEditing = useRef(isEditing)
  useEffect(() => {
    if (wasEditing.current && !isEditing) {
      setMode('json')
      setCreated(false)
    }
    wasEditing.current = isEditing
  }, [isEditing])

  // A new node's toolbar reverts to the value the node replaced
  const openToolbar = (creation?: { replaced: JsonData }) => {
    snapshot.current = creation ? creation.replaced : value
    setCreated(creation !== undefined)
    setMode('toolbar')
    setIsEditing(true)
  }

  // A toolbar action's change. One that hands the row to another component,
  // which can't carry the toolbar on, closes the session instead.
  const commit = (next: JsonData, { close = false } = {}) => {
    setValue(next)
    if (!close) setIsEditing(true)
  }

  // The raw-JSON buffer is untouched while the toolbar is open, so this
  // commits nothing and closes the session, as a commit
  const confirm = () => handleEdit()

  const revert = () => setValue(snapshot.current)

  // json-edit-react's matcher, with the host's `keyboardControls`. A key that
  // a focused button or the picker has already handled is left to it.
  const toolbarOpen = isEditing && mode === 'toolbar'
  useKeyboardListener(toolbarOpen, (e) => {
    const event = e as React.KeyboardEvent
    if (event.defaultPrevented) return
    if (event.target instanceof HTMLButtonElement && [' ', 'Enter'].includes(event.key)) return
    handleKeyboard(event, { confirm, cancel: revert })
  })

  return { editor: isEditing ? mode : null, created, openToolbar, commit, confirm, revert }
}
