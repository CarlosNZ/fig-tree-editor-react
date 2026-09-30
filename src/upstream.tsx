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
// which a custom button can't do yet.
export const ToGetNodeButton = ({ onClick, colour }: { onClick: () => void; colour: string }) => (
  <button
    type="button"
    className="ft-to-get-button"
    onClick={onClick}
    style={{ color: colour, borderColor: colour }}
  >
    {strings.FT_TO_GET_NODE}
  </button>
)
