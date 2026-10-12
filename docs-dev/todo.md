# fig-tree-editor-react — to-do

_Work still to do, across sessions, by area. One item per line, with where it is described in full where it is. An item is removed once it is done, since its commit records it. A decision an item needs is made in its design doc, and the item links there._

The build plan's remaining work (what is left of step 7, the definition editor's styles on the `editorTheme` tokens) is in [fragment-editor-design.md](fragment-editor-design.md), and isn't repeated here.

## Fragment editor

- **Checks on the fragment's name** in the definition editor: fig-tree's legal-name and reserved-name rules (`checkNameLegality`, `isReservedRegistrationName`, not exported) and a name an operator or alias holds, all of which registration refuses, and a name another registered fragment has, which registration replaces without a word. Since a registered fragment's rename saves at once, a rename onto another fragment's name replaces that fragment straight away; `useFragmentEditor` knows whether the draft is registered, which tells a rename onto it from editing it ("The definition editor", "Authoring state").
- **Whether the fragment is saved (registered):** an indicator, in the host or the editor, to be decided, from `useFragmentEditor`'s `canSave` and the draft's `registered` ("Authoring state").
- **Autocomplete after `$params.`,** listing the declared parameters, if typing the names turns out to be a nuisance ("Parameters", "In the expression editor"). See also "Suggestions while a reference is typed" below.
- **"Change to" on an undeclared parameter,** from the issue's `suggestion` (F21), beside "Declare". It rewrites the reference's first key, in each form a reference takes (`$p`, a drill, a template token, `get` from `$params`).
- **A `get` whose path is the parameter alone** (`{ path: 'x', from: '$params' }`) declared with its own position's type, as `$params.x` is (TO-DO in `src/declareParameters.ts`).
- **A picker for a declaration's `elementShape` constraint,** whose fields are declarations of their own, nested ("The definition editor").
- **Revealing a row from the definition editor's messages,** as the expression editor's do ("The definition editor").
- **Open:** whether `getFragments()` or `getCatalog` reports `samples`; a declared `returns`, checked against the inferred one ("The definition's shape", "Open").

## Expression editor

- **The type dropdown's Error entry inside a fallback,** as Element is inside an iterator. Its starting value is to be settled: `$error`, or `$error.message` (plan, 10.7; TO-DO in `src/customNodeDefinitions.ts`).
- **Suggestions while a reference is typed** (design, topic 5, "Editing references"), with what was considered for it there.
- **"Update references"** after a var rename or an `as` change breaks references (design, topic 4, "Adding parameters and starting values", and topic 5, "Renaming a var"). Needs F8.
- **"Move into a var"** (design, topic 5, "The vars block").
- **"Quote" and "Unquote"** for fragment calls, shorthand nodes and plain containers (design, topic 5, "`literal`"; plan, 9.3).
- **The shorthand forms barely change the UI** (plan, 8.3, "Revisit later"): ideas there, one of them needing J14.
- **The filled-in marker shown again** on revealing a filled-in line's row (plan, 10.3).
- **Quick fixes in a row's hover card,** and a card the pointer can move into, to scroll and copy a large value (design, topic 7).
- **Stepping through an iterator's elements,** one at a time, with ‹ › (design, topic 7, "Sub-tree evaluation").
- **Wrapping a sub-tree in an iterator only where the row reads its binding** (design, topic 7).
- **Why a row didn't run** ("`else`: `condition` was true"), which needs a reason on fig-tree's `skipped` trace entries (design, topic 7).
- **Each node's progress while an evaluation runs,** which needs fig-tree to report trace entries as they settle (design, topic 7).
- **A "Reads" list** beside the messages area, from `getDependencies()` (design, topic 7).
- **The operator picker:** a ranked best match, category swatches on group headers, the canonical name as a second label, descriptions cut to one line (design, topic 4). Needs a scoring hook in `Select`.
- **The fragment picker:** groups from a host-supplied key, and a line listing a fragment's parameters (design, topic 6).
- **Defaults in the add-parameter picker,** somewhere other than the hover card (design, topic 4; plan, 6.2).
- **Host props:** `customNodeDefinitions` from the host, `hiddenOperators` and `hiddenFragments`, an expected result type at the root, `evaluate(path?)` on the handle (design, topic 8).
- **Translations,** the editor's strings among json-edit-react's `translations` (design, topic 8).
- **The fill-in step as a pure function,** if a host needs to normalise stored expressions outside the editor (design, topic 8).
- **The editor using `@json-edit-react/components`' definitions,** such as a boolean toggle on boolean parameters (design, topic 8).

## Look and styling

- **Where a node's badge sits on its header's line** (plan, 10.1, "Revisit later").
- **Never-ran's grey** is close to a shorthand node's dashed grey, and a green ✓ is faint on a green operator's button (plan, 10.7, "Revisit later").
- **One custom property for the editor's sans-serif face,** which a host could set (plan, 9.4).
- **`editorTheme` values for `@json-edit-react/themes`' dark themes** (design, topic 8).
- **The theme's other kinds' styles,** each with the component that needs it (TO-DO in `src/editorTheme.ts`).

## Demo

- **The evaluation toast says where a result has one value per element,** from a row inside an iterator's `each` (plan, 10.7; TO-DO in `demo/src/App.tsx`).
- **A dependencies view,** and the rest of the trace (plan, Phase 10; design, topic 7).

## Waiting on upstream

- **Array elements have a hover card,** with J7 (design, topic 4).
- **A switch to "Single" keeps the union's first member,** once json-edit-react's switch to an enum reads the value `toStandardType` gives (TO-DO in `src/definitionNodes.tsx`).
- **The theme's collapsed case for a comment's note dropped,** once json-edit-react can keep a row from collapsing, J15 (TO-DO in `src/editorTheme.ts`).
- **Dragging,** once json-edit-react can keep a drop within its own array, J4 (`allowDrag` in `src/FigTreeEditor.tsx`).
