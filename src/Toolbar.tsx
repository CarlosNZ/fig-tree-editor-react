import { type ReactNode, type RefObject } from 'react'
import { IconCancel, IconOk } from './Icons'
import { strings } from './strings'

// A full node's toolbar, in place of its DisplayBar while it is open (design,
// topic 3, "Header and toolbar"): the node's controls, then ✓ and ✗. ✓ holds
// json-edit-react's `editConfirmRef`, so the handle's `confirm()` clicks it.

interface ToolbarProps {
  confirm: () => void
  revert: () => void
  editConfirmRef: RefObject<HTMLButtonElement | null>
  children: ReactNode // the node's controls
}

export const Toolbar = ({ confirm, revert, editConfirmRef, children }: ToolbarProps) => (
  <div className="ft-toolbar">
    {children}
    <div className="ft-toolbar-buttons">
      <button
        type="button"
        // json-edit-react's ref admits null, which React 18's `ref` doesn't
        ref={editConfirmRef as RefObject<HTMLButtonElement>}
        onClick={confirm}
        aria-label={strings.FT_TOOLBAR_CONFIRM}
      >
        {IconOk}
      </button>
      <button type="button" onClick={revert} aria-label={strings.FT_TOOLBAR_CANCEL}>
        {IconCancel}
      </button>
    </div>
  </div>
)
