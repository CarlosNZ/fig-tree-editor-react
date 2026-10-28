import { useRef, useState } from 'react'
import { type CustomKeyProps } from 'json-edit-react'
import { type DefinitionFields } from './definitionShape'
import { DisplayName, nameSize } from './DisplayBar'
import { readListing } from './displayData'
import { fragmentHeader } from './Fragment'
import { strings } from './strings'

export interface FragmentNameConfig {
  fragmentName: string | undefined
  setFragmentName: ((name: string | undefined) => void) | undefined
}

// The definition editor's root label (fragment-editor-design.md, "The
// definition editor"): the fragment's button as a call to it shows in the
// expression editor, its name in its colours, with its display name at the
// row's top right, read from the definition's `listing` as it is edited.
// There is no ▶, since nothing runs from here.
//
// A click turns the button into an input, in the same colours, that renames
// the fragment: Enter or leaving it saves, Escape cancels, and an empty name
// leaves the fragment unnamed. Without `setFragmentName` the button is a
// preview only. Clicks stop at the button and the input, since a click
// anywhere else on the row's header collapses the root.
export const FragmentNameKey = ({
  nodeData,
  componentProps,
}: CustomKeyProps<FragmentNameConfig>) => {
  const { fragmentName, setFragmentName } = componentProps!
  const [draft, setDraft] = useState<string | null>(null)
  // Set once the input saves or cancels, so the blur its removal can bring
  // doesn't save again
  const settled = useRef(false)

  const { listing } = nodeData.value as DefinitionFields
  const header = fragmentHeader(readListing(listing))
  const colours = { backgroundColor: header.colors.background, color: header.colors.text }

  const finish = (name: string | null) => {
    if (settled.current) return
    settled.current = true
    setDraft(null)
    if (name !== null) setFragmentName!(name.trim() || undefined)
  }

  if (draft !== null)
    return (
      <>
        <input
          className="ft-evaluate-button ft-fragment-name ft-fragment-name-input"
          style={colours}
          aria-label={strings.FT_FRAGMENT_NAME}
          value={draft}
          size={Math.max(draft.length, 8)}
          autoFocus
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(draft)
            else if (e.key === 'Escape') finish(null)
          }}
          onBlur={() => finish(draft)}
        />
        <DisplayName display={header} />
      </>
    )

  const label =
    fragmentName ?? (setFragmentName ? strings.FT_UNNAMED_FRAGMENT : strings.FT_FRAGMENT)
  const name = (
    <span className="ft-name" style={{ fontSize: nameSize(label) }}>
      {label}
    </span>
  )
  return (
    <>
      {setFragmentName ? (
        <button
          type="button"
          className="ft-evaluate-button ft-fragment-name"
          style={colours}
          title={fragmentName === undefined ? undefined : strings.FT_RENAME_FRAGMENT}
          onClick={(e) => {
            e.stopPropagation()
            settled.current = false
            setDraft(fragmentName ?? '')
          }}
        >
          {name}
        </button>
      ) : (
        <span
          className="ft-evaluate-button ft-fragment-name ft-fragment-name-fixed"
          style={colours}
        >
          {name}
        </span>
      )}
      <DisplayName display={header} />
    </>
  )
}
