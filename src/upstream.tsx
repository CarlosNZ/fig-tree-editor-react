import { IconSvg } from './Icons'
import { strings } from './strings'

// Stand-ins for what the editor has asked fig-tree-evaluator and
// json-edit-react for (docs-dev/v3-upstream.md), each to go when its change
// ships.

// TO-DO: replace with a json-edit-react custom button among a reference
// row's edit tools, committing through the `setValue` a custom button's
// `onClick` gets, once J13 ships
// (https://github.com/CarlosNZ/json-edit-react/issues/418).
//
// A reference's "To get node" (plan, 8.3), drawn by its component after the
// ▶ and shown on hover. The component commits it with the row's own
// `handleEdit`, so the host's `onUpdate` sees it as it sees every other edit,
// which a custom button can't do yet. It is an icon, a pair of braces for the
// node it gives, sized and hovered as json-edit-react's edit tools are, so it
// reads as one of them, with its name as its tooltip.
export const ToGetNodeButton = ({ onClick, colour }: { onClick: () => void; colour: string }) => (
  <button
    type="button"
    className="ft-to-get-button"
    onClick={onClick}
    aria-label={strings.FT_TO_GET_NODE}
    title={strings.FT_TO_GET_NODE}
    style={{ color: colour }}
  >
    <IconSvg
      className="jer-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4C7 4 7 5 7 7v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 0 3 2 3" />
      <path d="M15 4c2 0 2 1 2 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2 0 3-2 3" />
    </IconSvg>
  </button>
)
