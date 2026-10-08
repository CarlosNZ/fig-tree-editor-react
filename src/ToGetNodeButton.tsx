import { type CustomButtonDefinition, type JsonData, type NodeData } from 'json-edit-react'
import { rowAt, type Classification } from './classify'
import { getNodeFor, type ReferenceNames } from './conversions'
import { type EditorTheme } from './editorTheme'
import { IconSvg } from './Icons'
import { namespaceColour } from './Reference'
import { strings } from './strings'

// A reference's "To get node" (design, topic 3, "Kinds"; plan, 8.3): a pair
// of braces, for the node it gives, among the reference row's edit tools, in
// its namespace's colour. json-edit-react shows it on hover with the other
// tools, and its `handleEdit` commits the node, so the host's `onUpdate` sees
// it as it sees every other edit. There is nothing to show on a row that
// isn't a reference, on a reference with no `get` form (`$index`, `$error`,
// and a name an `as` gives), or where the row can't be edited.
export const toGetNodeButton = ({
  classification,
  editorTheme,
  referenceNames,
}: {
  classification: Classification
  editorTheme: EditorTheme
  referenceNames: ReferenceNames
}): CustomButtonDefinition => {
  const referenceAt = ({ path, value }: NodeData) => {
    const kind = rowAt(classification, path)?.kind
    if (kind?.kind !== 'reference') return null
    const node = getNodeFor(value as string, referenceNames)
    return node ? { node: node as JsonData, colour: namespaceColour(kind, editorTheme) } : null
  }

  return {
    label: strings.FT_TO_GET_NODE,
    Element: ({ nodeData, canEdit }) => {
      const reference = canEdit ? referenceAt(nodeData) : null
      return reference && <BracesIcon colour={reference.colour} />
    },
    onClick: (nodeData, _e, { handleEdit, canEdit }) => {
      const reference = canEdit ? referenceAt(nodeData) : null
      if (reference) handleEdit(reference.node)
    },
  }
}

// Sized and hovered as json-edit-react's own icons are
const BracesIcon = ({ colour }: { colour: string }) => (
  <IconSvg
    className="jer-icon"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    style={{ color: colour }}
  >
    <path d="M9 4C7 4 7 5 7 7v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 0 3 2 3" />
    <path d="M15 4c2 0 2 1 2 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2 0 3-2 3" />
  </IconSvg>
)
