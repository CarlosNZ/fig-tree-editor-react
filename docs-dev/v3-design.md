# fig-tree-editor-react v3 — design

_Working document for Phase 3 of [v3-plan.md](v3-plan.md). It records what the v3 editor looks like and does, topic by topic, with the reasoning behind each decision and the options rejected. Sections marked **Agreed** are settled, **Proposed** ones are drafted and awaiting a decision, and **Open** ones have not been discussed yet._

Topics, in the order they are worked through:

1. Node model
2. Editing model
3. Node anatomy
4. Operator picker and parameters
5. References and `vars`, then comments and `literal`
6. Fragments
7. Diagnostics and evaluation
8. Public API

---

## 1. Node model

### Principles — **Agreed**

- **Full form is the editing form.** A node is created and edited as a node only in full form: the header (DisplayBar) with its selectors and controls, and the named parameters below it, so it is always clear what is being edited. This is also how v1 works.
- **Shorthand is a representation.** A full node can be converted to shorthand to show it more simply. The values inside a shorthand node stay editable as what they are (plain values, or nodes of their own), but the shorthand node itself cannot be switched to another operator or fragment. To change it as a node, the author converts it back to full form.
- **Every node kind can be evaluated,** shorthand and bare references included, so sub-trees and data paths can be checked while an expression is being built. Sub-tree evaluation is a core part of how expressions are authored.
- **Custom operators are operators.** Host operators registered with `defineOperator()` are indistinguishable from core ones, so there is no separate custom-operator kind.

### Kinds — **Agreed**

| Kind                        | Example                                              | Notes                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operator, full              | `{ operator: 'plus', values: [1, 2] }`               | A broken node (unknown operator name, or a malformed node) is a state of this kind, rendered so the author can fix it from the header.                                         |
| Fragment call, full         | `{ fragment: 'greet', parameters: { name: 'Ada' } }` | Two variants, below.                                                                                                                                                           |
| Shorthand, named (operator) | `{ $if: { condition: c, then: a, else: b } }`        |                                                                                                                                                                                |
| Shorthand, named (fragment) | `{ $greet: { name: 'Ada' } }`                        | Fragments have no positional form.                                                                                                                                             |
| Shorthand, positional       | `{ $plus: [1, 2] }`, `{ $not: '$data.x' }`           | Operators only. Includes the single-value payload.                                                                                                                             |
| Literal, full               | `{ operator: 'literal', value: X }`                  | Grammar rather than an operator, so it has no `getOperators()` entry (below).                                                                                                  |
| Literal, shorthand          | `{ $literal: X }`                                    | The payload is the content, never named or positional.                                                                                                                         |
| Bare reference              | `'$data.user.name'`                                  | A string leaf, in any of the five namespaces.                                                                                                                                  |
| Plain container with holes  | `{ title: '$data.name', total: { $plus: [...] } }`   | Plain data that contains evaluable nodes. Gets a bare Evaluate button with no toolbar, as v1 does. Whether that is at the root only or on every such container is for topic 3. |
| Plain data                  | anything else                                        | Untouched json-edit-react content.                                                                                                                                             |

**Fragment call variants.** A full fragment call's `parameters` is either a static map, rendered as named arguments with the fragment's declared parameters available to add, or dynamic: a reference or node that computes the whole arguments object (`parameters: '$data.formValues'`). A dynamic call has no argument rows to offer, since its arguments are checked at runtime, and it has no shorthand form, so "To shorthand" is not offered on it. The fig-tree spec suggests badging dynamic calls; the editor does not, since `parameters` there is just a property with a value (topic 3).

**`literal` is grammar, not an operator.** It is absent from `getOperators()` and from `./editor-hints`, which cover the 40 operator definitions, so an Operator component would find no description, display data or parameter declaration for it. The editor supplies its display name, description and colour itself, and the operator picker lists it explicitly. Its one parameter, `value`, accepts any type, and its content is quoted. In shorthand, `{ $literal: X }` is never read as named or positional: the payload is the content.

**Modifier rows.** The reserved keys on a node, `//`, `vars`, `fallback` and `useCache`, are not parameters, and they form one family of child rows with their own treatment (designed in topics 3 and 5):

- `//` is a comment, formatted as a note belonging to its node. Its value is a string or an array of strings. The fill-in step places it first among the node's keys, so it renders at the top.
- `vars` is a block of names to expressions, with a header.
- `fallback` is an expression slot.
- `useCache` is a literal boolean (and is not legal on fragment calls).

**Quoted subtrees are plain data.** Everything inside a `literal` payload or a `//` value renders as plain data: no node headers, no Evaluate affordances on reference-shaped strings, no conversions. So plain data has two sources: values that are not expressions, and values that are quoted.

**`{ $typo: … }` is plain data,** matching the grammar, which treats an unrecognised `$` key as inert data with a warning. Only a recognised `$name` key makes a shorthand node.

### Classification — **Agreed**

**Kind depends on position, not only on value.** `vars: { operator: 'x' }` declares a var named `operator` rather than being an operator node; anything inside a `literal` or a `//` value is data whatever it looks like; and a `match` literal-branches map has classification edges of its own. A json-edit-react `condition` sees one node's value and path, so asking these questions per node means walking ancestors for every node on every render.

**So the editor classifies the whole tree once per update**, walking it as the compiler does and carrying the context (inside a `literal`, a comment or a `vars` block), and produces a map from path to kind. Each `condition` predicate is then a lookup in that map. The walk also runs once rather than once per node.

**The editor owns the walk; fig-tree supplies the per-object reading.** The compiler's own functions classify each object and string, so the editor never re-implements the grammar: `classifyObject` (`src/compile/grammar.ts`), `recognizeReference` (`src/compile/references.ts`) and `positionalLayout` (`src/compile/grammar.ts`, which maps a positional payload to parameters for the type filter). They are not public yet, so exporting them from `./format` is an upstream change (F1 in [v3-upstream.md](v3-upstream.md)). The walk around them, with its position rules, is the editor's: `literal` content and `//` values are not walked, a `vars` block is a map of names, a fragment call's `parameters` is a map or a node, `fallback` is an expression, and an iterator's `as` name is a reference namespace only inside its `each`. `./format`'s `Walk` (`src/format/walk.ts`) is the template, and its spec's "What the walk visits" table lists the rules.

- **Context flows down, never up.** The walk is top-down, as the compiler's and `./format`'s are, carrying a small context from each row to its children: quoted or not, inside a `vars` block or a `parameters` map, and the `as` names in scope. A row never needs its whole ancestor tree, only that context, and never needs its descendants beyond its own value one level down: a node decides its `$name` row's role (flattened or unlabelled) from that row's value, and a fragment call decides static or dynamic from its `parameters` value.
- **Proposed: the walk records each node's scope chain,** the paths of the `vars` blocks and iterators enclosing it, so sub-tree evaluation can build its wrappers from that record rather than walking the ancestors again.
- **Broken nodes come from `validate()`,** which the editor runs on every render. `classifyObject` reports only the grammar-level malformations; the rest (an unknown operator or fragment, the wrong number of arguments, an illegal sibling key, a fragment payload that is not an object) are issues at the node's path. The walk classifies; it does not re-validate.
- **A parity test guards against drift.** The editor's test suite compares its classification with the compiler's, using `inspect()` as the oracle: every node and reference the compiler finds, at the same paths. `inspect()`'s report shape is outside semver, which is acceptable in a test pinned to the fig-tree version the editor depends on.
- **Rejected: a tree-level classifier in `./format`.** It would keep the position rules beside the compiler, but it is editor-shaped API for fig-tree to keep stable, and `./format`'s walk would need a non-throwing mode, path access and `as`-scope tracking it does not otherwise need.

### Anchoring — **Agreed**

Every node kind is anchored on its own object (or, for a bare reference, its string), so the custom node's `value` is the whole node and its `path` is the node's path. Converting between forms then replaces the value at the same path, so the node stays where it is and "To full" is `onEdit(toCanonical(value, fig), path)`.

In `{ total: { $plus: [1, 2] } }`, json-edit-react renders four rows: `[]` (the root), `['total']` (the shorthand object), `['total', '$plus']` (the payload) and `['total', '$plus', 0]` (the `1`). The shorthand node's component is attached at `['total']`. The alternative, which v1 uses for shorthand with a collection payload, attaches it at `['total', '$plus']`, where the `$plus` key row disappears when the node is converted to full form, so the component unmounts and the new node mounts at a different path.

The cost is in rendering: the `$plus` row under the header has to lose its key label and brackets, so the payload's values appear directly beneath the header as a full node's parameters do. That needs a second definition matching the `$name` row, which json-edit-react supports (below).

The costs, accepted: every kind that can sit in a `$name` row needs an unlabelled copy of its definition; the classification map records each `$name` row's role as well as each node's kind; a flattened (named) payload has no json-edit-react edit tools, so a parameter is added to a named shorthand node through full form; each node shows json-edit-react's header row above the DisplayBar, as in v1; and while a node's toolbar is open, json-edit-react hides that node's edit tools (J1 in [v3-upstream.md](v3-upstream.md), dropped: the wart stays).

### What json-edit-react provides — **Findings**

Read from json-edit-react 2.0's source (`CustomNode.ts`, `CollectionNode.tsx`, `ValueNodeWrapper.tsx`, `utils/memoNode.ts`):

1. **One definition per row, first match wins.** `getCustomNode` takes the first definition whose `condition` matches. A row that plays two roles, such as a shorthand's `$not` row that is both the payload row and a bare reference, needs one definition covering both. So every such kind gets an unlabelled copy of its definition ("Flattened payloads and unlabelled rows", below).
2. **A collection definition's `component` receives the child rows as `children`,** rendered inside the collection's inner block. json-edit-react's own header row (chevron, key, bracket, item count, edit tools) stays above it unless `showCollectionWrapper: false`.
3. **`showCollectionWrapper: false` with `showKey: false` renders the child rows only:** no header row, no brackets, no edit tools, and never collapsed. That is exactly the flattened payload row, used for a named payload. The catch is that it loses its own edit tools, so json-edit-react offers no "add key" on a named payload, and adding a parameter to a named shorthand node goes through full form. A positional payload is unlabelled instead, and keeps its edit tools (topic 3). With `showKey: true`, a slim row with the key and the edit tools remains.
4. **A value definition's `component` replaces the value display.** With `showOnEdit: false` (the default), editing falls back to json-edit-react's standard input, so a bare reference edits as an ordinary string. `passOriginalNode` hands the component the standard rendering to wrap.
5. **`renderCollectionAsValue`** renders a collection through the value path, as one unit. That suits a multi-line comment (`'//': ['…', '…']`).
6. **A row re-renders only when its own `data`, path or props change.** The memo ignores `customNodeData`, and a `condition` that reads another subtree won't re-run on a row whose data is unchanged. Because kind depends on position, wrapping a subtree in `literal` changes the kind of rows whose data has not changed. So when the path-to-kind map's content changes, the editor passes a new `customNodeDefinitions` array, which re-renders every row; when it does not (most edits), the array keeps its identity. The map is compared by content, not identity.
7. **A row's left margin** comes from the indent, followed by the theme's `collection` style, so the theme can remove the extra indent a flattened payload row would otherwise add.
8. **The type selector exists only on value rows,** as in v1.

Nothing here needs an upstream change. v1's `filterChildren`, which drops the `operator` / `fragment` row by its React key, stays: json-edit-react has no option to omit a row entirely.

### Node shapes and their definitions — **Agreed, provisionally**

[v3-node-anatomy.md](v3-node-anatomy.md) spells out each kind's rows and components in full, with sketches. The table is agreed as the starting point for Phase 4 and may be revised as the components are built: most changes are to definitions, but a change to a row's role (flattened or unlabelled, say) also changes the classification walk and its tests.

The definition types used below:

- **Node:** a collection definition with a `component` (the header, then the child rows). json-edit-react's header row is kept for collapse, key and edit tools, and the theme hides its brackets. Full nodes' components own both of their editors ("Two editors per node", below).
- **Flattened payload:** a collection definition with no component, `showCollectionWrapper: false` and `showKey: false`, so the row itself disappears and its children appear directly beneath the parent's header.
- **Leaf:** a value definition with a `component` in view mode and the standard input while editing.
- **Unlabelled:** a copy of any other definition with `showKey: false` added, so the row renders as that definition renders it, without its key label.
- **Filtered:** removed from the parent's children by `filterChildren`.
- **None:** no definition; json-edit-react renders the row as it is.

#### Flattened payloads and unlabelled rows

Both apply to a shorthand node's `$name` row (`$plus`, `$not`, …), whose key is redundant because the header above it already shows the name. Which one applies depends on what the row holds.

In the sketches below, the header row (`[ $plus ▶ ] Addition  [To full]`) is the Shorthand component on the object row in both columns. The left column shows the `$name` row beneath it with no definition of its own, so json-edit-react renders it by default and repeats the name as its key label. The right column shows it with the definition described.

**A flattened payload** is for a `$name` row holding an object of named parameters. The row's key, brackets, collapse chevron and edit tools all go, and its parameters render directly beneath the header, as a full node's do.

```
{ $if: { condition: '$data.ok', then: 'Yes' } }

$name row left as is:               with a flattened payload:
[ $if ▶ ] If  [To full]             [ $if ▶ ] If  [To full]
   $if: {                              condition: $data.ok ▶
     condition: $data.ok ▶             then: Yes
     then: Yes
   }
```

**An unlabelled row** is for every other `$name` row: an array of positional arguments, or a single value (a reference, a nested node, or a plain value). The row stays and renders exactly as that value otherwise would, with only its key label removed. A positional array keeps its brackets, chevron and edit tools, since it is still one value, the argument list, beneath the `$name`. Flattening a single value would be wrong: a string has no collection chrome to remove, and flattening a nested node would remove that node's own header. A single plain value or reference renders on the same line as the Evaluate button, as in v1 (topic 3); the sketches below show it on its own line.

```
{ $plus: [1, 2] } — the row is a plain array (None), unlabelled

$name row left as is:               unlabelled:
[ $plus ▶ ] Plus  [To full]         [ $plus ▶ ] Plus  [To full]
   $plus: [                            [
     1                                   1
     2                                   2
   ]                                   ]
```

```
{ $not: '$data.x' } — the row is a Leaf (Reference), unlabelled

$name row left as is:               unlabelled:
[ $not ▶ ] Not  [To full]           [ $not ▶ ] Not  [To full]
   $not: $data.x ▶                     $data.x ▶
```

```
{ $not: { $greaterThan: ['$data.age', 18] } } — the row is a Node (Shorthand), unlabelled

$name row left as is:               unlabelled:
[ $not ▶ ] Not  [To full]           [ $not ▶ ] Not  [To full]
   $not:                               [ $greaterThan ▶ ] Greater than
     [ $greaterThan ▶ ] …                 $data.age ▶
        $data.age ▶                       18
        18
```

```
{ $not: true } — the row has no definition of its own (None), unlabelled

$name row left as is:               unlabelled:
[ $not ▶ ] Not  [To full]           [ $not ▶ ] Not  [To full]
   $not: true                          true
```

**Why unlabelled definitions are copies.** The copies are entries in the `customNodeDefinitions` array, the UI configuration handed to json-edit-react; the expression itself is never changed to get a rendering. json-edit-react applies only the first matching definition to a row (finding 1), so a "hide the key" definition cannot be layered over a row's Reference or Shorthand definition. Each kind that can appear as a single-value payload therefore has a second definition object, identical to the first except for `showKey: false` and a condition that also requires the row to be a `$name` row, generated mechanically by a helper, as v1's `editVariants` generates its toolbar pair:

```ts
const unlabelledVariants = (def: CustomNodeDefinition): CustomNodeDefinition[] => [
  { ...def, condition: and(def.condition, isNameRow), showKey: false },
  def,
]
```

"Evaluate" means the sub-tree evaluation described below. Every row keeps json-edit-react's edit tools unless stated otherwise, and none of these rows get affordances inside a quoted subtree.

#### Full operator nodes

| Shape                                                                                     | Rows → definition                                        | Renders                                                                                                                 | Behaviour                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ operator: 'plus', values: [1, 2] }`                                                    | object → Node (Operator); `operator` → Filtered          | Header: Evaluate button showing the name as written, display name linked to `docUrl`, description tooltip, To shorthand | DisplayBar pencil opens the toolbar (operator picker, add parameter, node type switch); edit-tools pencil opens raw JSON; parameter rows get the per-parameter type filter |
| `{ operator: '+', values: [1, 2] }`                                                       | as above                                                 | Button shows `+`                                                                                                        | Switching between `plus` and `+` keeps the node                                                                                                                            |
| `{ '//': 'why', operator: 'http', url: '…', fallback: null, vars: {…}, useCache: false }` | as above; each modifier row → its own definition (below) | Comment first, then parameters and modifiers                                                                            | As above                                                                                                                                                                   |
| `{ operator: 'flibble' }`, `{ operator: 42 }`, `{ operator: 'plus', fragment: 'x' }`      | object → Node (Operator, broken state)                   | Header shows the name (or "invalid node") as an error, with the issue's message                                         | Toolbar available, to pick a valid operator; no Evaluate or conversion, since the compiler and `./format` refuse the node                                                  |

A misspelled parameter (`{ operator: 'if', thn: 'x' }`) is not a kind: the node is well-formed and the `thn` row carries a diagnostic (topic 7).

#### Full fragment calls

| Shape                                                      | Rows → definition                                                                 | Renders                                                                | Behaviour                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `{ fragment: 'greet', parameters: { name: 'Ada' } }`       | object → Node (Fragment); `fragment` → Filtered; `parameters` → Flattened payload | Header with the fragment's `FragmentHints`; arguments directly beneath | Toolbar: fragment picker, add argument (declared parameters), node type switch |
| `{ fragment: 'greet' }`                                    | as above, with no `parameters` row                                                | Header only                                                            | Adding an argument creates `parameters`                                        |
| `{ fragment: 'greet', parameters: '$data.form' }`          | object → Node (Fragment, dynamic); `parameters` → Leaf (reference), key shown     | Header, then the `parameters` row, with no badge                       | No add-argument; no To shorthand                                               |
| `{ fragment: 'greet', parameters: { $buildObject: […] } }` | object → Node (Fragment, dynamic); `parameters` → the node's own kind, key shown  | As above                                                               | As above                                                                       |
| `{ fragment: 'nope' }`                                     | object → Node (Fragment, broken state)                                            | Header shows the name as an error                                      | Toolbar available, to pick a registered fragment                               |

#### Shorthand nodes

| Shape                                                                                                  | Rows → definition                                                                        | Renders                                                                                                                         | Behaviour                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ $if: { condition: c, then: a, else: b } }`                                                          | object → Node (Shorthand); `$if` → Flattened payload                                     | Header: Evaluate button showing `$if` in italics, display name, and its conversion button ("To positional"); parameters beneath | Values editable in place, with the type filter by parameter name; no toolbar                                                                                                                                                                                                                                                                                                 |
| `{ $plus: [1, 2] }`, `{ '$+': [1, 2] }`                                                                | object → Node (Shorthand); `$plus` → None (the argument array), unlabelled               | Header, then the array with its brackets and edit tools                                                                         | As above, with the type filter by position through `positionalParams`; the array's ＋ adds an element where the operator has a rest parameter or an unfilled optional trailing position. Showing each element's parameter name, dimmed, would need a component on every element row or a JER option, since JER draws no key slot for array elements while indexes are hidden |
| `{ $not: true }`                                                                                       | object → Node (Shorthand); `$not` → None, unlabelled                                     | Header, with the value on its line                                                                                              | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $not: '$data.x' }`, `{ $min: '$data.scores' }`                                                      | object → Node (Shorthand); `$not` → Leaf (reference), unlabelled                         | Header, with the reference on its line                                                                                          | As above; the reference has its own Evaluate                                                                                                                                                                                                                                                                                                                                 |
| `{ $not: { $greaterThan: […] } }`, `{ $and: { $map: … } }`                                             | object → Node (Shorthand); `$not` → Node (Shorthand), unlabelled                         | Header, then the inner node's header                                                                                            | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $http: 'https://…', fallback: null }`                                                               | object → Node (Shorthand); `$http` → Leaf or None, unlabelled; `fallback` → modifier row | Header, the URL, then the fallback row                                                                                          | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $greet: { name: 'Ada' } }`, `{ $greet: {} }`                                                        | object → Node (Shorthand, fragment); `$greet` → Flattened payload                        | Header with the fragment's hints (no form toggle: fragments are named only), then the arguments                                 | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $greet: { $buildObject: […] } }`                                                                    | object → Node (Shorthand, fragment, dynamic); `$greet` → Node, unlabelled                | Header, then the node                                                                                                           | To full gives a canonical dynamic call                                                                                                                                                                                                                                                                                                                                       |
| `{ $plus: [1], extra: 2 }`, `{ $plus: 1, $minus: 2 }`, `{ $greet: '$data.x' }`, `{ $if: ['$data.x'] }` | object → Node (Shorthand, broken state)                                                  | Header shows the error                                                                                                          | No Evaluate or conversion (`./format` throws); fixed through raw JSON                                                                                                                                                                                                                                                                                                        |

#### `literal`

| Shape                                             | Rows → definition                                                                                                                                                            | Renders                                                                                 | Behaviour                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `{ operator: 'literal', value: { $plus: 1 } }`    | object → Node (Literal); `operator` → Filtered; the `value` subtree is quoted, so None throughout                                                                            | Header with the editor's own display data for `literal`, then the content as plain data | Toolbar as for an operator (the picker lists `literal`); `value` accepts any type; To shorthand gives `{ $literal: … }` |
| `{ $literal: { $plus: 1 } }`, `{ $literal: 'x' }` | object → Node (Literal, shorthand); `$literal` → the content's own row, unlabelled (not flattened, so a collection keeps its brackets and edit tools); the content is quoted | Header (no form toggle), then the content as plain data                                 | To full gives the canonical form                                                                                        |

#### References and other strings

| Shape                                                                   | Rows → definition | Renders                                                       | Behaviour                                                                                |
| ----------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `'$data.user.name'`, `'$d.user.name'`, `'$data'`                        | Leaf (Reference)  | The string in its namespace's colour, with an inline Evaluate | Edits as a string; "To get node" among the hover edit tools                              |
| `'$vars.country[0].name'`, `'$element.name'`, `'$index'`, `'$order.id'` | Leaf (Reference)  | As above                                                      | As above; Evaluate needs the ancestor scope; `$index` has no get form, so no To get node |
| `'$vars.nope'`, `'$element'` outside an iterator                        | Leaf (Reference)  | As above, with its diagnostic                                 | No Evaluate                                                                              |
| `'$dat.x'`, `'$database'`, `'Hi {{$data.name}}'`                        | None              | A plain string (the first two carry a warning)                | —                                                                                        |

#### Plain data and modifier rows

| Shape                                                              | Rows → definition                                              | Renders                                           | Behaviour                                                             |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `{ title: '$data.name', total: { $plus: […] } }`, `['$data.a', 1]` | Node (Container)                                               | A bare Evaluate button above the rows             | Evaluate only, at the root only (topic 3)                             |
| `{ a: 1 }`, `{ $typo: 1 }`                                         | None                                                           | Plain json-edit-react (`$typo` carries a warning) | —                                                                     |
| `'//': 'note'`                                                     | Leaf (Comment), with `showKey: false`                          | A note belonging to its node                      | Edits as a string                                                     |
| `'//': ['line 1', 'line 2']`                                       | Leaf (Comment), `renderCollectionAsValue` and `showKey: false` | A multi-line note                                 | Editing to be decided in topic 5                                      |
| `vars: { country: {…}, n: 5 }`                                     | Node (Vars)                                                    | A "vars" header; each row's key is a var name     | Values classified as usual; names follow the name-legality rule       |
| `fallback: …`, `useCache: false`                                   | None, with a modifier style on the key                         | The row, marked as a modifier                     | `fallback`'s value is classified as usual; `useCache` is boolean only |
| Inside a `literal` payload or a `//` value                         | None throughout                                                | Plain data                                        | No Evaluate, conversion or reference styling                          |

### Conversions — **Agreed**

- **One conversion button steps through the forms** (topic 3): a full node's button reads "To shorthand" and gives the named form; a named shorthand's reads "To positional"; a positional shorthand's reads "To full". A node with no positional form (a fragment call, `literal`, an operator without `positionalParams`) swaps between full and named.
- **"To shorthand" and "To full" convert the node and its whole subtree,** as `./format`'s `toShorthand` (with `arguments: 'named'`) and `toCanonical` do.
- **"To positional" also converts the whole subtree,** as `./format`'s `toShorthand` with `arguments: 'positional'` does, so every conversion is subtree-wide and needs nothing new upstream. A node-only conversion was considered, which would need a single-level option in `./format` (F2 in [v3-upstream.md](v3-upstream.md), dropped); it may be revisited once the editor is in use.
- **A bare reference can be turned into a `get` node** (`toGet`), so the author can add `default` or `from`. A `get` node can be turned back into a reference (`toReference`) wherever that returns a value; `null` means the affordance is not offered.
- Conversions are not offered inside quoted subtrees.

### Sub-tree evaluation — **Agreed** (direction; mechanics in topic 7)

Evaluating a sub-tree compiles and evaluates a synthesised expression: the sub-tree, wrapped in the scope its ancestors give it, so the compiler sees a self-contained expression while the author sees the value they expect from the tree.

- **`vars`:** one plain-object wrapper per ancestor `vars` block, nested in the same order rather than merged, so shadowing and var definitions that read outer vars behave as in the real tree. Vars are lazy, so wrapping every ancestor block costs nothing for vars the sub-tree does not read.
- **Iterator bindings:** a binding has one value per element, so the sub-tree is wrapped in a `map` over its iterator's `input` (with the same `as`), and the result is one value per element. Which parameter is per-element, and which sibling it iterates over, comes from `getOperators()` (`evaluation: 'perElement'` and `over`), so host iterators work too.
- **`$data`** is the sample data passed to the editor.
- **`$params`** only occurs in a fragment body, which the editor does not edit.
- Ancestors' `fallback`s are not applied, so a failure inside the sub-tree is shown rather than caught.
- Error and trace paths come back in the synthesised expression's coordinates and are mapped back to the tree's.

---

## 2. Editing model

### Legality — **Agreed**

- **The structured path keeps nodes legal,** as in v1. Creating a node, switching operator or fragment, and adding a parameter from the picker each end in a valid node: required parameters are seeded, and the picker offers only declared parameters. (`./editor-hints`' drift tests check that each operator's starting node validates.)
- **The editor still holds and renders any expression,** because invalid ones arrive by other routes: free edits of values (a `get` path that does not parse, `'$vars.nope'`), adding or deleting array items against a parameter's constraints, changes that break scope elsewhere (deleting a var, removing an `as`, dragging a node out of its iterator), a node whose declared `returns` does not fit its position, raw-JSON edits, input the editor did not write, and registry changes under an existing expression. It reports problems and never refuses an expression.
- **Problems are shown twice:** as an error state on the row the issue's path points at, and as the issue's full message in a dedicated messages area (topic 7).
- **Narrowing the routes where it is cheap** is for later topics: the operator picker hiding operators whose `returns` does not fit the parameter (topic 4), and array add and delete respecting constraints (topics 4 and 7).

### The fill-in step — **Agreed**, except where marked

The editor's step that changes the tree, run over the whole expression after every update and when the host passes an expression in. It is not called "validate" (plan, Phase 5).

- **Complete: insert missing required parameters with their starting values** (the seed rule from `./editor-hints`), on load and after every update. For a fragment call with static arguments, the same applies to its required arguments, with the fragment's `FragmentHints` seeds. It is form-aware: a named payload gains a key, and a positional payload gains trailing elements, since supplied positional arguments are always an unbroken prefix. It cannot apply to dynamic arguments.
- **Clean: remove parameters that do not belong only on a structural action,** never on load and never on a content edit.
- **Put keys in order:** `//` first, then the node's parameters in their declared order, then `fallback` and `useCache`, then `vars` last (topics 1 and 3).
- **Unknown keys stay,** with the error state and quick fixes: remove the key, or rename it where fig-tree suggests a name (F3 in [v3-upstream.md](v3-upstream.md)).

**Structural actions — Agreed.** The actions where the editor itself rewrites a node's identity: creating a node from the type dropdown, switching operator, fragment or node type, adding a parameter from the picker, and the conversions. Everything else is a content edit: value edits, json-edit-react's add and delete, drag and drop, the host's input, and raw-JSON submits. A raw-JSON submit is content because the author has typed exactly what they want, and it is the escape hatch for what the structured path cannot express: changing `operator: 'plus'` to `'if'` in the textarea removes nothing, and the leftover parameters show as unknown-key errors. The rule: **the editor only removes what the editor itself made obsolete.**

**The typo guard — Agreed, if fig-tree provides the suggestion.** A missing required parameter is not inserted when the node has an unknown key that `validate()` suggests is a misspelling of it (`thn` for `then`). The node shows both errors, and one quick fix, "Rename `thn` to `then`", clears both, rather than a seed appearing beside the typo. `validate()` puts the suggestion only in the message text, and the editor will not carry a did-you-mean matcher of its own, so the guard and the rename quick fix both depend on a machine-readable suggestion from fig-tree (F3 in [v3-upstream.md](v3-upstream.md)). Without it there is no guard, and an unknown key's only quick fix is "Remove".

**Marking what was filled in on load — Agreed.** The editor remembers which paths it completed when an expression was loaded, as UI state outside the data, and marks those rows until the user edits or dismisses them, with a line for each in the messages area. The seed value itself is not annotated: most seeds are not strings, and an annotated string would be saved as real data if nobody noticed it.

### Reporting state to the host — **Provisional** (to be revisited in topic 8)

The host needs the editor's state, for example to disable its own Save button while the expression is invalid.

- **An `onStatusChange` callback,** called when the status changes rather than on every render, with something like `{ valid, errorCount, warningCount, issues, editing }`. `editing` is true while a value or raw-JSON edit is open, since its text is not yet in the expression.
- **An imperative handle,** passing json-edit-react's `editorRef` through, so a host can `confirm()` or `cancel()` an open edit before saving.
- The editor passes every expression to `setExpression`, invalid ones included. Whether an invalid expression may be saved is the host's decision.

### Node lifecycle — **Agreed**, except where marked

**Creating a node.** A value row's type dropdown is the entry point, as in v1: it offers "Operator", and "Fragment" when fragments are registered. The new node starts with its required parameters seeded (a fragment's required arguments go in a static `parameters` map), and its picker opens straight away, so the starting operator is only momentary. The starting operator is host-configurable, as in v1. Where the row is a parameter, operators whose declared `returns` fits it are preferred, the detail being topic 4's. A reference needs no action: typing `$data.x` into a string makes it one. json-edit-react has no type dropdown on collection rows, so a plain object or array becomes a node by way of a value or raw JSON, as in v1. v1's `justSwitchedTo` opens the picker; json-edit-react's `editOnTypeSwitch` could replace it, but renders the component in a value row, with no child rows, so it is not pursued unless that proves worthwhile.

**Switching operator** (full form, from the toolbar's picker) is a structural action, so it cleans:

- The modifiers are kept: `//`, `vars`, `fallback` and `useCache`.
- Parameters whose name the new operator also declares are kept, even where the kept value no longer type-checks against the new declaration: the error shows straight away, and the author's work is not lost. So `plus` to `multiply` keeps `values`, and `map` to `filter` keeps `input`, `each` and `as`.
- The other parameters are dropped, and the new operator's missing required parameters are seeded.
- There is no confirmation step, even when the switch drops a subtree.

The same rule repairs a broken node: picking `plus` for `{ operator: 'plsu', values: [1, 2] }` keeps `values`.

**Switching node type** (Operator, Fragment or Value, from the toolbar):

- Operator to Fragment gives the default fragment with its required arguments seeded, keeping `//`, `vars` and `fallback` and dropping `useCache`, which fragment calls do not allow.
- Fragment to Operator gives the default operator, seeded, keeping the same modifiers.
- Either to Value replaces the node with the starting value for its position: the parameter's seed where it is a parameter, otherwise the seed for its declared type, and the string seed anywhere else.
- After a switch the new node's picker opens, as in v1.

**Name or alias — Agreed.** The picker has one entry per operator, titled with editor-hints' display name, which already carries the alias ("Plus (+)"), so there is no separate alias badge. Search matches either spelling. It opens with the current operator selected. There is no separate spelling control:

- **A new operator node** gets the canonical name, or a host preference if one is added (topic 8).
- **Switching to another operator keeps the node's current spelling where the new operator allows it:** `+` to `*`, and `+` to `?` for `if`. An operator with no alias gets its canonical name, and the node's spelling is then canonical: `+` to `match` to `multiply` ends as `multiply`.
- **Selecting the current operator again toggles its spelling** (`plus` to `+` and back). For an operator with no alias it does nothing.

**The toggle is signposted on the current entry:** a short hint on the same line as its display name, such as "select again to write as `+`", since toggling by re-selecting is not something a dropdown usually does, and someone who clicks the current entry just to close the menu would otherwise flip its spelling unexpectedly. If accidental toggles still prove a problem, the fallback is to make only that hint toggle, with a click elsewhere on the row closing the menu unchanged.

### Two editors per node — **Agreed**

Each full node (operator, fragment call and `literal`) can be edited two ways: through the structured toolbar, opened by the DisplayBar's pencil, or as raw JSON, opened by the ✎ in json-edit-react's edit tools. Shorthand nodes and plain containers have no toolbar, so their only editor is json-edit-react's raw JSON.

**One definition per full node, whose component owns both editors.** The definition has `showOnEdit: true`, so its component renders every edit session on its row, whichever button opened it. The component keeps the requested editor in local state: the DisplayBar's pencil sets it to the toolbar before opening the session, json-edit-react's ✎ opens the session without setting it, so the component shows raw JSON, and the state resets when the session ends. The raw-JSON editor is json-edit-react's own, composed into the component (J2 in [v3-upstream.md](v3-upstream.md), filed as [json-edit-react#411](https://github.com/CarlosNZ/json-edit-react/issues/411)), the collection counterpart of composing `StringEdit` into a value component.

**Rejected: v1's variant pair.** v1 gives each node two definitions, a toolbar variant (`showOnEdit: true`, matching only while `displayBarEditPath` names the node) and a default variant (`showOnEdit: false`, so json-edit-react's textarea shows), with `useCommon` setting and clearing the path. It works, but a row's definition is chosen by its parent and json-edit-react's memo ignores a change of definition, so switching variants means passing a new `customNodeDefinitions` array, which re-renders every row, twice per toolbar use. Local state in the component re-renders that node only.

**Rejected: editor modes on json-edit-react's edit session**, so that a definition could show its own editor only in sessions opened in a "custom" mode. It would remove the same bookkeeping, but it is more public API than composition needs, and composition already serves value rows through `StringEdit`.

**Without J2**, the component renders `AutogrowTextArea` itself and re-implements the parse error, keyboard handling and the host's `TextEditor`, and JSON typed into it is lost when another node's edit displaces the session. The details are to be proved on one node early in Phase 4.

**Each editor has one way in:** the DisplayBar's pencil opens the toolbar, and json-edit-react's ✎ opens raw JSON. There is no switch between them inside a session: the toolbar's "Edit as JSON" and the raw-JSON editor's "Use the toolbar" were mocked up (topic 3) and dropped, since each only saves closing the session and reopening it from the other control.

While a session is open, json-edit-react hides the row's edit tools, as in v1. Changing that (J1) was considered and dropped for now, to be revisited once the toolbar can be tried in the built editor.

### Commit semantics — **Agreed**

**Toolbar edits are live, and Cancel reverts.** When the toolbar opens, the component takes a snapshot of its node's value. Each change writes through as it is made, so the child rows beneath always show the current state. ✓ and Enter close and keep the changes; ✗ and Esc write the snapshot back and close; opening another node's editor keeps the changes, as json-edit-react does when one edit displaces another. The revert writes the snapshot exactly as it was, without the fill-in step, since the snapshot was already complete. It is one write to a stable path, because the node is anchored on its own object, and nothing else in the tree can change while the toolbar is open, since editing another row opens a new session and closes this one first. It also covers the risk accepted under "Node lifecycle": a switch that drops parameter subtrees can be cancelled while the toolbar is open.

**Rejected:** live edits with no Cancel, which leaves no way back from an unintended change; and holding the changes until ✓, which would leave json-edit-react rendering the old child rows beneath a switched operator's header until confirmed.

**Undo history.** A host that saves automatically sees the intermediate states, and a host using `@json-edit-react/utils`' `useUndo` records one step per write, including Cancel's revert, so Undo straight after a Cancel brings back the cancelled state. The editor therefore reports its edit sessions' boundaries to the host (with the provisional host API, topic 8), and a host using `useUndo` groups each session into one step, or none when cancelled, with the transactions requested as J3 in [v3-upstream.md](v3-upstream.md). Without J3, history behaves as in v1: one step per toolbar action.

**Completion on load and undo — Open (topic 8).** Completing an expression on load is one `setExpression` call, so it records the incomplete expression as an undo step. One answer is to export the fill-in step as a pure function, so a host can call `reset(complete(expression))` when it loads one.

### Guards — **Agreed**

The host's own `allowDelete`, `allowAdd` and `allowDrag` filters apply first; the editor's guards only add restrictions, as in v1.

**Deleting** (json-edit-react's ✕). Blocked:

- the root;
- a required parameter of a full node, including a static fragment call's required arguments in its flattened `parameters`;
- a required parameter in a named shorthand payload;
- in a positional payload, an element bound to a leading parameter, except the last element when its parameter is optional. Deleting a middle one would silently shift the rest onto different parameters (`{ $if: [c, a, b] }` without `a` makes `b` the `then`). Elements of the rest parameter can be deleted freely. `positionalLayout` (F1) says which is which;
- an unlabelled `$name` row (`{ $not: '$data.x' }`'s `$not` row, or `$literal`'s content), whose deletion would leave `{}`: the node is deleted from its own row instead;
- an element of an array parameter at its declared fixed length (`constraints.length`, as for the ordering comparisons' two values).

Allowed, with any resulting error shown: optional parameters, modifiers and comments; vars and `as`, even when something reads them; and the last element of an aggregate, since "not empty" is not declared in the metadata (`plus` with `values: []` is reported by `validate()`).

**Adding** (json-edit-react's ＋). json-edit-react's `newKeyOptions` turns an object row's ＋ into a choice of allowed keys, omitting those already present, and its `defaultValue` receives the new key, so each can be seeded:

- on a full operator node, its undeclared parameters and the modifiers not yet present (`//`, `vars`, `fallback`, `useCache`), each seeded, making the ＋ a second route to "add parameter";
- on a full fragment call, the modifiers other than `useCache`, and `parameters` if absent; arguments are added through the toolbar, since they belong inside `parameters`;
- on a shorthand node, the modifiers only, since any other key would make it malformed;
- on a vars block, a free-typed name, with the name rules reported by `validate()`;
- on an array parameter, an element seeded for its type, blocked at a declared fixed length;
- on a positional shorthand's argument array, an element seeded for the parameter it would bind, allowed only where the operator has a rest parameter or an unfilled optional trailing position;
- on plain data and quoted content, anything.

**Renaming keys.** json-edit-react allows renaming a key where the row can be deleted and its parent accepts adds, so a required parameter cannot be renamed. An optional parameter can, to anything, which is another route to an unknown key, shown as an error. That is accepted: json-edit-react has no separate rename permission, and one is not worth requesting.

**Dragging.** Allowed only to reorder elements within their own array: array parameters on full nodes, plain arrays, quoted arrays, and positional payloads whose elements all belong to the rest parameter (`$plus`, `$and`, `$or`, `$firstOf`, `$min`, `$max`). Not allowed in a positional payload with leading parameters (`$if`, `$buildString`), where reordering changes what each element binds, nor for object keys, which the fill-in step orders on nodes anyway. json-edit-react cannot enforce "within its own array" today, since a relocate between collections is permitted by delete and add alone, so this depends on a target-aware drop filter (J4 in [v3-upstream.md](v3-upstream.md), filed as [json-edit-react#413](https://github.com/CarlosNZ/json-edit-react/issues/413)). **Without J4, drag-and-drop is disabled completely**, since rejecting the move in `onUpdate` would leave json-edit-react showing the drop as allowed until it reverts.

---

## 3. Node anatomy

Worked through on mockups: [FigTree Node Mockups](https://claude.ai/artifact/WcfDoiKYH84FsQxQa4r84E), with frames labelled A1, C3 and so on. Exact colours, weights and spacing are settled when the components are built; these decisions fix what is shown and where.

### Header and toolbar — **Agreed**

- **The DisplayBar keeps v1's layout:** the Evaluate button showing the name as written, the pencil beside it, the display name at the top right linking to `docUrl`, and the conversion buttons beneath it.
- **The pencil and the conversion buttons appear on hover only,** as in v1, keeping the tree uncluttered when it is only being read.
- **The toolbar replaces the DisplayBar** while it is open: node type, operator or fragment picker, add parameter, ✓ and ✗. It has no switch to the raw-JSON editor ("Two editors per node").
- **The raw-JSON editor's surround** (the "Editing as JSON" label in A4) is a formatting choice left until it is built.

### States — **Agreed**, except where marked

- **Modifier keys look different from parameters** (`fallback`, `useCache`; italic and muted in the mockups, the exact style to be settled later).
- **A broken node** has an error border and stripe (A5). **A row an issue points at** is tinted, with a short flag. There is no issue-count badge on the header, and no "unknown operator" badge.
- **A collapsed node with an issue** colours its summary line as an error.
- **Filled in on load — Proposed:** the amber marker (A6) fades after a few seconds, needing no edit to clear. Its line in the messages area stays until dismissed, so the record is not lost if the marker is missed.
- **No badge for dynamic fragment arguments:** `parameters` there is a property with a value, and nothing needs to call attention to it.
- **No "quoted data" badge on `literal`:** its neutral colour and plain-data content are enough.

### Kinds — **Agreed**, except where marked

- **Shorthand nodes have a dashed border** (v1 draws none), which also keeps a nested shorthand node's extent visible (C4). The name on the button is italic, as in v1, for now.
- **A single plain value or reference sits on the button's line** (C3), as in v1, since the point of shorthand is concision. A nested node as the single value still goes beneath (C4).
- **A positional payload keeps its brackets** (C2): the argument array is unlabelled rather than flattened, keeping its chevron and edit tools, since it is still one value beneath the `$name`. A named payload stays flattened (C1).
- **One conversion button cycles the forms:** "To shorthand" on a full node (giving the named form), "To positional" on a named shorthand, "To full" on a positional one; a node with no positional form swaps between full and named ("Conversions", topic 1). Going from named back to full takes two clicks, by way of positional.
- **`literal` keeps its Evaluate button,** for consistency, though it only returns the content.
- **References:** Evaluate is a small ▶ inline after the text. "To get node" is a json-edit-react custom button on reference rows, appearing on hover with the other edit tools. **Each namespace has its own colour:** `$data`, `$vars`, `$params`, and the iterator bindings (`$element`, `$index` and `as` names). The palette: violet for `$data`, teal for `$vars`, magenta for `$params`, and amber-brown for the bindings, each distinct from json-edit-react's string, number, boolean and null colours. **The colours are tokens that a host can swap,** like the rest of the theme. Whether they belong in an extension of json-edit-react's theme definitions, which today cover only its own elements, is to be investigated (J5 in [v3-upstream.md](v3-upstream.md)).
- **Plain containers with holes** get the bare Evaluate button **at the root only,** for now.
- **Comments** render as a note beneath the header, with json-edit-react's edit tools on hover like any row.
- **Row order:** the node's parameters, then `fallback` and `useCache`, then `vars` last. The vars block takes the `$vars` reference colour and is set slightly apart from the rows above it. The fill-in step orders keys to match.
- **Fragment display name:** the "· fragment" suffix shows where there is room, and is hidden when the editor is narrow.
- **Fragment default colour:** a generic colour for every fragment whose metadata defines none: v1's default for now, to be tweaked later, a dark steel blue with yellow text (`#477799` on `#ebdf5a`), for every fragment whose metadata carries no colours. Every operator button is a light shade of its category's hue, so a dark button stands apart by treatment without borrowing any category's hue. Deriving a colour from the fragment's name (hashing the name to a hue, then making a light background and dark text as editor-hints' palette does) would tell fragments apart, but an arbitrary hue can land on an operator category's colour and suggest a category the fragment does not belong to, and renaming a fragment would change its colour. A host that wants fragments told apart gives them `FragmentHints` colours.

### Collapsed nodes — **Agreed**

As in v1: a collapsed node shows only json-edit-react's header row, with a summary between the brackets in place of the item count (section I of the mockups): `{ Operator: plus }`, `{ Fragment: greet }`, `{ Shorthand: $if }`, `{ Literal }`, `{ 2 vars }`, and the ordinary count for plain containers. A node with an issue colours its summary as an error, and with more than one, adds a count ("3 errors"). A collapsed operator, fragment or shorthand node shows a small inline ▶ after its summary, so it can be evaluated without expanding it; other collapsed rows do not.

### Messages — **Proposed** (detail in topics 7 and 8)

A messages region built into the component, below the tree as in Phase 2's skeleton: one line per `validate()` issue and per value filled in on load, each with its path (which reveals the row) and any quick fix. The same information goes to the host through the provisional `onStatusChange`, and a prop hides the built-in region for a host that renders its own.
