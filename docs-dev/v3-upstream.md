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

| ID  | Package            | Change                                                               | State    | Issue                                                             |
| --- | ------------------ | -------------------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| F1  | fig-tree-evaluator | Export `classifyObject`, `recognizeReference` and `positionalLayout` | Required | Not filed                                                         |
| F2  | fig-tree-evaluator | A single-level option for `toShorthand` and `toCanonical`            | Dropped  | Not filed                                                         |
| F3  | fig-tree-evaluator | A machine-readable suggestion on unknown-name issues                 | Wanted   | Not filed                                                         |
| F4  | fig-tree-evaluator | A `literal` entry in `./editor-hints`                                | Maybe    | Not filed                                                         |
| F5  | fig-tree-evaluator | `plus` declares `homogeneous` on `values`                            | Maybe    | [#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198) |
| F6  | fig-tree-evaluator | Export `typesIntersect`                                              | Maybe    | [#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198) |
| F7  | fig-tree-evaluator | A description on every parameter                                     | Maybe    | [#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198) |
| F8  | fig-tree-evaluator | A scope-aware rename helper in `./format`                            | Maybe    | Not filed                                                         |
| F9  | fig-tree-evaluator | A fragment-body option on `validate()`                               | Open     | Not filed                                                         |
| F10 | fig-tree-evaluator | Supplying `$params` values to `evaluate()`                           | Open     | Not filed                                                         |
| F11 | fig-tree-evaluator | Infer and report a fragment's result type                            | Wanted   | Not filed                                                         |
| F12 | fig-tree-evaluator | Sample-data warnings at the path of the reading node                 | Wanted   | Not filed                                                         |
| J1  | json-edit-react    | Keep a node's edit tools visible while its custom toolbar is open    | Dropped  | Not filed                                                         |
| J2  | json-edit-react    | Expose the raw-JSON editor to custom collection components           | Wanted   | [#411](https://github.com/CarlosNZ/json-edit-react/issues/411)    |
| J3  | json-edit-react    | Transactions in `useUndo` (`@json-edit-react/utils`)                 | Wanted   | [#412](https://github.com/CarlosNZ/json-edit-react/issues/412)    |
| J4  | json-edit-react    | A target-aware drop filter for drag-and-drop                         | Wanted   | [#413](https://github.com/CarlosNZ/json-edit-react/issues/413)    |
| J5  | json-edit-react    | Theme definitions that can carry a custom component's own tokens     | Open     | Not filed                                                         |
| J6  | json-edit-react    | A type selector for collection rows                                  | Maybe    | Not filed                                                         |
| J7  | json-edit-react    | A key component for array elements while indexes are hidden          | Maybe    | Not filed                                                         |
| J8  | json-edit-react    | Open an object's add-key input from the editor handle                | Dropped  | Not filed                                                         |
| J9  | json-edit-react    | Reveal a row from the editor handle                                  | Maybe    | Not filed                                                         |

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

### F3 · A machine-readable suggestion on unknown-name issues — **Wanted**

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

**Extended (topic 4): unknown operator and fragment names.** `unknown-operator` (`'plsu' names no registered operator — did you mean 'plus'?`), `unknown-fragment` and the shorthand's `unrecognized-identifier` warning carry the same kind of suggestion in their message text. With it as a field too, the operator picker opens a broken node with the suggested operator highlighted ("The operator picker" in [v3-design.md](v3-design.md)).

**Without it.** No typo guard, so a seed appears beside the typo, and the unknown key's only quick fix is "Remove". A broken node's picker opens with nothing highlighted.

**Issue.** Not filed.

### F4 · A `literal` entry in `./editor-hints` — **Maybe**

**The change.** A display entry for `literal` (display name, `docUrl`, colours, and the seed for `value`) in `./editor-hints`, although `literal` is grammar rather than an operator definition. 3.0.0-preview.1's `operatorHints` has 43 entries, the 40 core operators plus the three I/O ones, and none for `literal`.

**Why.** `literal` is absent from `getOperators()` and from the hints, which cover the 40 operator definitions, so the editor has no display data for it. ("Kinds" in [v3-design.md](v3-design.md).)

**Without it.** The editor hard-codes `literal`'s display data, including its seed (`'No content inside a literal node is evaluated'`, "`literal`" in [v3-design.md](v3-design.md)). That works, but keeps one operator's presentation apart from all the others', and its `docUrl` would not move with fig-tree's documentation.

**Issue.** Not filed.

### F5 · `plus` declares `homogeneous` on `values` — **Maybe**

**The change.** `constraints: { homogeneous: ['number', 'string', 'array', 'object'] }` on `plus.values`. `plus`'s own description already states the rule ("all operands must share one type"), but only its body enforces it, so the metadata declares `values` as a plain `array`.

**Why.** An element of an array parameter admits what its constraints say ("Slots" in [v3-design.md](v3-design.md)), so with the constraint `plus`'s elements admit the four types rather than `any`: the type dropdown narrows, a new element can be seeded to match its siblings, and `validate()` reports a mixed literal payload through the generic constraint check. fig-tree may have reasons not to (its own mixed-type message, the `expect` pin, `runtimeTypeCheck: false` skipping constraints), which the issue lists.

**Without it.** `plus`'s elements admit `any`, as the metadata says.

**Issue.** [CarlosNZ/fig-tree-evaluator#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198), item 1.

### F6 · Export `typesIntersect` — **Maybe**

**The change.** Export `typesIntersect` (`src/typeCheck.ts`) from `./format`, beside F1's functions.

**Why.** An operator cannot fit a slot when its declared `returns` and the slot's type share no value, which is exactly `validate()`'s `returns-mismatch` check, so the picker's test must agree with it to the letter, including the `integer`/`number` bridge and literal-union members matching by runtime type ("Slots" in [v3-design.md](v3-design.md)). Exporting the function keeps the rules in one place as the type vocabulary grows. A containment companion may be asked for later, if the operator picker gets a "Suggested" section.

**Without it.** The editor re-implements it (about 40 lines), with a parity test against `validate()`'s `returns-mismatch` over every core operator at every typed parameter.

**Issue.** [CarlosNZ/fig-tree-evaluator#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198), item 2.

### F7 · A description on every parameter — **Maybe**

**The change.** Descriptions for the nine parameters that have none in 3.0.0-preview.1 (`power.base`, `power.exponent`, and `value` on `round`, `floor`, `ceil`, `abs`, `lower`, `upper` and `trim`), and a test that every core and I/O parameter has one.

**Why.** A row's tooltip is its declaration's `description` ("Slots" in [v3-design.md](v3-design.md)).

**Without it.** Those rows have no tooltip.

**Issue.** [CarlosNZ/fig-tree-evaluator#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198), item 3.

### F8 · A scope-aware rename helper in `./format` — **Maybe**

**The change.** A function beside `toCanonical`, `toGet` and the rest, for example `renameBinding(expression, fig, { at, from, to })`, where `at` is the path of a `vars` block or an iterator. It renames the declaration and every reference that resolves to it, and returns the new expression with the paths it updated and the paths it refused. It covers:

- **a var:** reference strings in its scope (a `get`'s `from` and sibling vars included) and `{{$vars.…}}` tokens in `buildString` templates, leaving references that read a shadowing var alone and keeping short spellings (`$v.`);
- **an iterator's `as`,** changed, added or removed: `$order` / `$orderIndex`, or `$element` / `$index` where they resolve to that iterator;
- **a declared fragment parameter,** in a fragment body: `$params.name`.

It refuses a reference where the new name is declared closer, since rewriting it would silently read the wrong binding, and one that would need a name the author cannot write (the outer element inside a nested iterator without `as`, when `as` is removed).

**Why.** The editor's "Update references" quick fix, offered after a rename breaks references ("Renaming a var" in [v3-design.md](v3-design.md)), and renaming a fragment parameter in fragment-definition mode (topic 6). fig-tree already has what it needs: its static checks resolve each reference to its declaring block (`resolveVar` in `src/compile/staticChecks.ts`), and its compiler turns template tokens into reference nodes with paths. Doing it in the editor would need the unexported template-token grammar and a second copy of the resolution rules.

**Without it.** No quick fix: a rename renames nothing, and each broken reference is fixed by hand. The quick fix itself is do-later, to be reconsidered once the built editor can be tried.

**Issue.** Not filed.

### F9 · A fragment-body option on `validate()` — **Open**

**The change, to be decided.** A `validate()` option that checks an expression as the body of a fragment, for example `validate(body, { fragment: { name, parameters } })`. With the declared parameters, `$params` references resolve against them as at registration: the static checker already takes the names (`runStaticChecks(artifact, { fragmentParams })` in `src/compile/staticChecks.ts`), which only `registerFragments` passes today. With the fragment's name, a call that would close a cycle through the fragment being defined can be reported, which a nameless body cannot be. It may also need to check the declarations themselves (shape, defaults against their types, `required` with a `default`), which are otherwise checked only by `new FigTree()` and `updateOptions()`.

**Why.** In fragment-definition mode, `validate()` reports every `$params` reference as `unresolved-param`, declared or not, and the editor cannot run registration's checks itself: it cannot build a scratch instance, since an instance never returns its operator definitions, and `updateOptions()` on the host's instance would change it ("Fragment-definition mode" in [v3-design.md](v3-design.md), parked).

**Without it.** A body edited in the editor shows an error on every `$params` reference, and its other registration errors appear only when the host registers it.

**Open because** fragment-definition mode is parked, including what belongs in the editor and what the host handles around it.

**Issue.** Not filed.

### F10 · Supplying `$params` values to `evaluate()` — **Open**

**The change, to be decided.** A way to evaluate an expression as a fragment body with given arguments, for example an `evaluate()` option carrying the declared parameters and test values for them, applying declared defaults and null-means-unset as a real call does.

**Why.** `evaluate()` refuses any `$params` reference with `unresolved-param`, so neither a whole body nor a sub-tree of one can be evaluated in the editor. Conforma's fragment editor evaluates a body with test parameters entered in a separate JSON editor ("Fragment-definition mode" in [v3-design.md](v3-design.md), parked). Rewriting `$params` references into `$vars` would need fig-tree's unexported template-token grammar, as a rename would (F8).

**Without it.** Evaluating a body means registering it: on a separate instance the host builds with its own operator definitions, which the host can do and the editor cannot.

**Open because** fragment-definition mode is parked.

**Issue.** Not filed.

### F11 · Infer and report a fragment's result type — **Wanted**

**The change.** At registration, infer each fragment's result type from its body, report it on `getFragments()` (as `returns`, the operator field's name), and extend `validate()`'s `returns-mismatch` check to fragment calls in parameter positions. Registration already compiles every body, and its rollup pass already visits fragments in reverse topological order, so a body that calls another fragment can use that fragment's inferred type. The type is read from the body's root:

- an operator node, in any face: its declared `returns`;
- a fragment call: the called fragment's inferred type;
- `literal`: its content's type;
- a constant: its own type;
- a plain object or array: `object` or `array`;
- a reference: `any`, since references are untyped;
- a `fallback` on the root is ignored, as the operator check ignores it today (`{ $upper: '$data.x', fallback: 0 }` at `round.value` is reported).

**Also, the same check for plain containers.** `{ $round: { value: { a: '$data.x' } } }` is not reported in 3.0.0-preview.1, though an object can never be a number. It is the same feeding-position check, with the container's type known statically.

**Why.** The fragment picker moves fragments that cannot fit their position to "Not valid here", as the operator picker does for operators ("The fragment picker" in [v3-design.md](v3-design.md)). The editor cannot infer the type itself, because `getFragments()` deliberately omits the body. And the picker blocks only what `validate()` rejects, which today never includes a fragment call: its feeding check runs only where the supplied node is an operator (`supplied.kind === 'operator'` in `src/compile/staticChecks.ts`). So `{ $round: { value: { fragment: 'str' } } }` validates cleanly even where `str`'s body is `{ $upper: 'x' }`.

**Without it.** Every fragment fits every position: the picker offers all of them, a new call starts as the host's default fragment wherever it is, and Fragment is offered in the type dropdown wherever a fragment is registered.

**Issue.** Not filed.

### F12 · Sample-data warnings at the path of the reading node — **Wanted**

**The change.** `validate(expression, { data })` reports each statically known `$data` path the sample data lacks as a `missing-data-path` warning, always at `path: []` (`src/validation.ts`, which walks the stored dependency list, where the reading nodes' paths are no longer kept). The change is to report one warning per reading node, at its path: a reference string, a `get` node with a literal path, or a string holding a `{{$data.…}}` token. A path read in several places would then give one warning at each. The compiler already turns every reference into a node with a path, so the paths exist at compile time; the dependency record would keep them beside each path's segments.

**Why.** Each issue marks the row at its path ("Where issues attach" in [v3-design.md](v3-design.md)), so `'$data.user.nmae' is absent from the supplied sample data` belongs on the row that reads `$data.user.nmae`. At `[]` it lands on the root, far from the typo it reports.

**Without it.** The sample-data warnings appear in the messages area only, naming the path but marking no row.

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

### J6 · A type selector for collection rows — **Maybe**

**The change.** A type selector for a row holding an object or array, for example in its edit session, so it can be switched to a primitive, an enum or a named custom type, as a value row can. Today json-edit-react offers type selection on value rows only (`ValueNodeWrapper.tsx`), and a collection's edit session is the raw-JSON textarea.

**Why.** Parameters that usually hold arrays or objects (`values: [1, 2]`, `buildObject.entries`, `http.body`) cannot be turned into a reference or a node from the type dropdown ("The type dropdown" in [v3-design.md](v3-design.md)).

**Without it.** The author uses raw JSON, as in v1. Accepted for now (Carl, September 2026); to revisit once the editor is in use.

**Issue.** Not filed.

### J7 · A key component for array elements while indexes are hidden — **Maybe**

**The change.** Render a matching definition's `keyComponent` for an array element even when `showArrayIndexes` is false, leaving what to show to the component. Today an element row renders no key at all in that case (`showLabel` is false in `CollectionNode.tsx`), so a key component has nowhere to render.

**Why.** Two features want a label slot on array elements: the parameter hover card ("Parameter metadata" in [v3-design.md](v3-design.md)), for elements of array parameters and positional arguments; and topic 1's dimmed parameter names on positional elements (`condition`, `then`, `else` beside `$if`'s arguments).

**Without it.** Elements have no card and positional arguments no labels, as now.

**Issue.** Not filed.

### J8 · Open an add-key input from the editor handle — **Dropped**

**The change.** A `startAdd({ path })` on `JsonEditorHandle`, beside `startEdit`, opening an object row's add-key input as its ＋ does. Today `startEdit` opens value edits only, and the ＋ appears on hover only.

**Why it came up.** Adding a var takes two steps: "Add parameter → `vars`" creates `vars: {}`, then the author finds the empty block's ＋ to name the first var. With `startAdd`, creating the block could open its name input at once ("The vars block" in [v3-design.md](v3-design.md)).

**Why it was dropped.** Two steps are acceptable for now (Carl, September 2026).

**Revisit.** If the two steps prove awkward once the editor is in use.

**Issue.** Not filed.

### J9 · Reveal a row from the editor handle — **Maybe**

**The change.** A `reveal({ path })` on `JsonEditorHandle`, which expands the row's collapsed ancestors and scrolls the row into view without opening an edit. `startEdit` already reveals a target collapsed below the mount frontier, so the logic exists; this exposes it on its own.

**Why.** Clicking a line's path in the messages area reveals its row ("The messages area" in [v3-design.md](v3-design.md)). json-edit-react's rows carry no marker of their path, so the editor can expand the ancestors through `collapse` but can only scroll to an element it draws itself.

**Without it.** The editor scrolls to the nearest element it draws: the row where it has a component, otherwise the enclosing node's header. Expected to be adequate in most cases (Carl, September 2026); to revisit if it proves not to be.

**Issue.** Not filed.
