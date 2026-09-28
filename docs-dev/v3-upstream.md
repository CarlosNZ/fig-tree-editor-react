# fig-tree-editor-react v3 — upstream changes

_Changes the v3 editor needs in fig-tree-evaluator and json-edit-react, logged as the design finds them (working rule 3 in [v3-plan.md](v3-plan.md)). Each entry becomes a GitHub issue in its package's repository when it is ready to file, and its issue link is recorded here._

## States

- **Required:** an agreed design decision depends on it, and the editor has no fallback.
- **Wanted:** an agreed feature depends on it. Without it the feature is dropped or reduced, but the editor still works.
- **Maybe:** a nicety. The editor has a workable fallback.
- **Open:** whether it is needed at all is still to be decided.
- **Dropped:** considered and not pursued. The entry stays, with the reason, so it is not raised again without new grounds.

An entry also records whether its issue has been filed, and when the change has shipped.

## Summary

| ID  | Package            | Change                                                               | State    | Issue                                                          |
| --- | ------------------ | -------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| F1  | fig-tree-evaluator | Export `classifyObject`, `recognizeReference` and `positionalLayout` | Required | Not filed                                                      |
| F2  | fig-tree-evaluator | A single-level option for `toShorthand` and `toCanonical`            | Dropped  | Not filed                                                      |
| F3  | fig-tree-evaluator | A machine-readable suggestion on `unknown-node-key` issues           | Wanted   | Not filed                                                      |
| F4  | fig-tree-evaluator | A `literal` entry in `./editor-hints`                                | Maybe    | Not filed                                                      |
| J1  | json-edit-react    | Keep a node's edit tools visible while its custom toolbar is open    | Dropped  | Not filed                                                      |
| J2  | json-edit-react    | Expose the raw-JSON editor to custom collection components           | Wanted   | [#411](https://github.com/CarlosNZ/json-edit-react/issues/411) |
| J3  | json-edit-react    | Transactions in `useUndo` (`@json-edit-react/utils`)                 | Wanted   | [#412](https://github.com/CarlosNZ/json-edit-react/issues/412) |
| J4  | json-edit-react    | A target-aware drop filter for drag-and-drop                         | Wanted   | [#413](https://github.com/CarlosNZ/json-edit-react/issues/413) |
| J5  | json-edit-react    | Theme definitions that can carry a custom component's own tokens     | Open     | Not filed                                                      |

---

## fig-tree-evaluator

### F1 · Export the per-object classification — **Required**

**The change.** Export three existing functions from `fig-tree-evaluator/format`, which already shares them with the compiler:

- `classifyObject(raw, recognizes)` (`src/compile/grammar.ts`): what an object is, by its keys (operator, fragment, shorthand with its key, plain, or malformed).
- `recognizeReference(value)` (`src/compile/references.ts`): whether a string is a reference, and in which namespace.
- `positionalLayout(shape, length)` (`src/compile/grammar.ts`): how a positional payload maps to parameters.

The subpath's value-import lint rule and its exports test would need extending, and the format spec would need a section on them.

**Why.** The editor classifies the whole tree once per update, and must read each object and string exactly as the compiler does. The walk around them, with its position rules, stays in the editor. `positionalLayout` maps a positional payload's elements to parameters, for their type dropdowns. ("Classification" in [v3-design.md](v3-design.md).)

**Without it.** The editor would re-implement the grammar, which is how v1's classification drifted from the evaluator's. There is no acceptable fallback.

**Issue.** Not filed.

### F2 · A single-level conversion option — **Dropped**

**The change.** An option on `toShorthand` and `toCanonical` that converts the given node only, leaving its children as they are. The format spec deferred this ("Finer control … can come later").

**Why it came up.** A shorthand node's positional/named conversion was to affect that node only. The editor cannot fake it by swapping the children for placeholders before converting, because the single-value collapse rule depends on what the child is.

**Why it was dropped.** The editor's one conversion button now converts the whole subtree at every step: "To shorthand" (named), "To positional" and "To full" ("Conversions" in [v3-design.md](v3-design.md)), all of which `./format` already does.

**Revisit.** If node-only conversion proves wanted once the editor is in use.

**Issue.** Not filed.

### F3 · A machine-readable suggestion on `unknown-node-key` issues — **Wanted**

**The change.** `validate()` already works out which declared parameter an unknown key is probably a misspelling of, but reports it only in the message text:

```json
{
  "severity": "error",
  "code": "unknown-node-key",
  "message": "'thn' is not a parameter of 'if' — did you mean 'then'?",
  "path": ["thn"],
  "operator": "if"
}
```

The change is a field carrying it, for example `suggestion: 'then'`. It might also be worth giving the issue the unknown key itself as `parameter`, as the `missing-required` issue already does for the missing parameter.

**Why.** Two editor features use it, and the editor will not carry a did-you-mean matcher of its own ("The fill-in step" in [v3-design.md](v3-design.md)):

- **The typo guard.** The fill-in step does not insert a missing required parameter when an unknown key on the node is its suggested misspelling, so a seed does not appear beside the typo.
- **The rename quick fix.** "Rename `thn` to `then`", which clears both errors at once.

**Without it.** No typo guard, so a seed appears beside the typo, and the unknown key's only quick fix is "Remove".

**Issue.** Not filed.

### F4 · A `literal` entry in `./editor-hints` — **Maybe**

**The change.** A display entry for `literal` (display name, `docUrl`, colours) in `./editor-hints`, although `literal` is grammar rather than an operator definition.

**Why.** `literal` is absent from `getOperators()` and from the hints, which cover the 40 operator definitions, so the editor has no display data for it. ("Kinds" in [v3-design.md](v3-design.md).)

**Without it.** The editor hard-codes `literal`'s display data. That works, but keeps one operator's presentation apart from all the others', and its `docUrl` would not move with fig-tree's documentation.

**Issue.** Not filed.

---

## json-edit-react

Reading json-edit-react 2.0's custom-node machinery for the node model found nothing else the design needs from it ("What json-edit-react provides" in [v3-design.md](v3-design.md)).

### J1 · Edit tools visible while a custom toolbar is open — **Dropped**

**The change.** An opt-in on a custom node definition that keeps the row's own edit tools visible while its custom component is editing.

**Why it came up.** json-edit-react hides a row's edit tools while that row is editing (`showEditButtons = !isEditing`), so a full node's ✎ ＋ ✕ disappear while its toolbar or raw-JSON editor is open. It is a known wart carried from v1, and a cost of anchoring nodes on their own object.

**Why it was dropped.** The code change would be small, but each tool needs a defined meaning mid-session: ✎ would reopen a session already open, ＋ would open an add session that displaces it, and ✕ would delete the node being edited, leaving only copy harmless. The benefit is small: the toolbar has its own add-parameter control, and deleting or copying the node can wait until it closes. The one tool that would be useful mid-session, switching to raw JSON, the node's component can offer in its toolbar with no json-edit-react change, since it owns both editors (J2).

**Revisit.** Carl may reverse this once the toolbar can be tried in the built editor, which counts as new grounds.

**Issue.** Not filed.

### J2 · The raw-JSON editor for custom collection components — **Wanted**

**The change.** The collection counterpart of `StringEdit`: json-edit-react's raw-JSON editor, as an element a custom collection component can render, wired to the row's own edit buffer so that parsing, the invalid-JSON error, commit on displace, keyboard handling and the host's `TextEditor` all keep working. The issue sets out two possible shapes: expose the buffer and export an element, or pass a pre-wired element as `passOriginalNode` does for value rows.

**Why.** A full node's component owns both of its editors, the structured toolbar and raw JSON, from one definition ("Two editors per node" in [v3-design.md](v3-design.md)). That replaces v1's variant pair, its `displayBarEditPath` state and the whole-tree re-render that switching variants needs.

**Without it.** The component renders its own `AutogrowTextArea` and re-implements the parse error, keyboard handling and `TextEditor` support, and JSON typed into it is lost when another node's edit displaces the session, since json-edit-react commits the row's own buffer on displace. Or the editor keeps v1's variant pair.

**Issue.** [CarlosNZ/json-edit-react#411](https://github.com/CarlosNZ/json-edit-react/issues/411).

### J3 · Transactions in `useUndo` — **Wanted**

**The change.** In `@json-edit-react/utils`, a transaction on `useUndo`: `begin()` records the current value as a checkpoint, writes during the transaction are not recorded, `end()` records the checkpoint as one step if the value changed, and `end({ discard: true })` records nothing.

**Why.** A full node's toolbar writes each change through as it is made and reverts to a snapshot on ✗ or Esc ("Commit semantics" in [v3-design.md](v3-design.md)). With `useUndo` as it is, each toolbar action is its own undo step and the revert is one more, so Undo straight after a Cancel brings back the cancelled state. The existing `replace` cannot group the writes from outside, since `set` records the value in its render closure, the latest intermediate state. The editor reports its session boundaries to the host, which a host using `useUndo` wires to a transaction.

**Without it.** History behaves as in v1, one step per toolbar action, plus the surprising Undo after Cancel.

**Issue.** [CarlosNZ/json-edit-react#412](https://github.com/CarlosNZ/json-edit-react/issues/412).

### J4 · A target-aware drop filter — **Wanted**

**The change.** A drop permission that sees both the dragged node and where it would land (for example `allowDrop(source, target)`), AND-ed with the existing rules and consulted by both the drag highlight and the drop. Today a same-collection reorder is permitted by `allowEdit` on the collection, and a cross-collection relocate by `allowDelete` on the source plus `allowAdd` on the destination, so no rule can apply to moves alone.

**Why.** The editor allows drag-and-drop only to reorder elements within their own array, and not within a positional payload with leading parameters, where swapping elements changes what they bind ("Guards" in [v3-design.md](v3-design.md)). Relocation cannot be forbidden without also forbidding add or delete, and a reorder cannot be forbidden without locking the collection's own editing.

**Without it.** Drag-and-drop is disabled completely: the only other enforcement point is rejecting the move in `onUpdate`, after json-edit-react has already shown the drop as allowed.

**Issue.** [CarlosNZ/json-edit-react#413](https://github.com/CarlosNZ/json-edit-react/issues/413).

### J5 · Theme tokens for custom components — **Open**

**The change, to be investigated.** A way for a json-edit-react theme to carry tokens that a custom component defines for itself, alongside the built-in elements (`string`, `number`, `property` and the rest), so that one theme object styles both.

**Why.** Each reference namespace has its own colour (`$data`, `$vars`, `$params`, and the iterator bindings), and the colours must be tokens a host can swap ("Kinds" under topic 3 in [v3-design.md](v3-design.md)). The same goes for the vars block, the modifier keys and the error and filled-in states. json-edit-react's `ThemeableElement` list is fixed, so today such tokens would live in a separate editor prop, and a host would theme the editor in two places.

**Without it.** The editor defines its own token set, as CSS custom properties or a prop, beside json-edit-react's theme.

**Issue.** Not filed.
