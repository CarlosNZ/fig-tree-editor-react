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
- **The walk records each node's scope chain,** the paths of the `vars` blocks and iterators enclosing it, so sub-tree evaluation can build its wrappers from that record rather than walking the ancestors again, and the type dropdown offers Variable and Element only where they are in scope (topic 4).
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

| Shape                                                              | Rows → definition                                             | Renders                                           | Behaviour                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `{ title: '$data.name', total: { $plus: […] } }`, `['$data.a', 1]` | Node (Container)                                              | A bare Evaluate button above the rows             | Evaluate only, at the root only (topic 3)                             |
| `{ a: 1 }`, `{ $typo: 1 }`                                         | None                                                          | Plain json-edit-react (`$typo` carries a warning) | —                                                                     |
| `'//': 'note'`                                                     | Leaf (Comment line), with `showKey: false`                    | A note belonging to its node                      | Edits as a string                                                     |
| `'//': ['line 1', 'line 2']`                                       | a plain array with `showKey: false`; each line a Comment line | A multi-line note, styled as one block            | Each line edits as a string; ＋ adds a line (topic 5)                 |
| `vars: { country: {…}, n: 5 }`                                     | None, with theme styling on the block (topic 5)               | A tinted block; each row's key is a var name      | Values classified as usual; names follow the name-legality rule       |
| `fallback: …`, `useCache: false`                                   | None, with a modifier style on the key                        | The row, marked as a modifier                     | `fallback`'s value is classified as usual; `useCache` is boolean only |
| Inside a `literal` payload or a `//` value                         | None throughout                                               | Plain data                                        | No Evaluate, conversion or reference styling                          |

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
- **`$params`** only occurs in a fragment body, which the editor edits only in fragment-definition mode (topic 6), where what it evaluates to is decided.
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
- an element of an array parameter that would take it further from its declared fixed length (`constraints.length`, as for the ordering comparisons' two values; topic 4, "Array constraints").

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

---

## 4. Operator picker and parameters

### Slots — **Agreed**

A **slot** is a position whose value is evaluated and delivered somewhere with an expectation attached: a parameter, a fragment argument, an element or field of an array parameter, a `match` branch, a modifier, a var, the root, or plain data inside an evaluated position. The editor records one for every such row. The type dropdown, the operator picker, the starting values of new entries, the guards, row descriptions, diagnostics and sub-tree evaluation all read it, so none of them works out a position's meaning for itself.

A slot describes what a position expects; it does not judge the value there. `validate()` stays the authority on whether a value is valid, and the slot is the editor's reading of the same metadata, used to shape and seed choices before and during an edit. The row's kind (topic 1's map) says what is there, and the slot says what is expected; most consumers read both.

```ts
type Slot = {
  path: Path // this row
  ownerPath: Path | null // the node whose declaration this slot belongs to; null at the root
  role:
    'parameter' | 'element' | 'entry' | 'field' | 'arguments' | 'modifier' | 'var' | 'data' | 'root'
  parameter?: string // the declared name, where there is one
  declaration?: ParameterInfo // from getOperators() or getFragments()
  admits: ExpectedType // what a value here must be
  literalOnly: boolean // `as`, `useCache`: no nodes or references
}
```

**How positions resolve:**

| Row                                                           | Role and admits                                                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `{ operator: 'round', value: X }`, `{ $round: { value: X } }` | parameter `round.value`: `['number', 'null']`                                                                                 |
| `{ $round: [X, Y] }`                                          | parameters by position, through `positionalLayout` (F1): `value`, then `decimals`                                             |
| `{ $not: X }`                                                 | the first position (`singlePositionalTarget`): `not.value`                                                                    |
| `{ $and: X }`, X a reference                                  | the rest parameter as a whole: `and.values`, `array`                                                                          |
| `{ $and: [X] }`, `values: [X]`                                | an element of `values` (below)                                                                                                |
| `entries: [{ key: X, value: Y }]`                             | fields of `elementShape`: `key` admits `['string', 'number', 'boolean']`, `value` admits `any`                                |
| `branches: { a: X }` (`match`, literal map)                   | an entry: `any`. The parameter is `lazyEntries`, so the map's values are slots and its keys are data                          |
| `branches: '$data.map'`                                       | parameter `match.branches`: `object`                                                                                          |
| `parameters: { name: X }` (static fragment call)              | parameter, from the fragment's declaration, which has the same shape as an operator's                                         |
| `parameters: X` (dynamic)                                     | arguments: `object`                                                                                                           |
| `fallback: X`                                                 | modifier: `any`                                                                                                               |
| `useCache: X`                                                 | modifier: `boolean`, literal only                                                                                             |
| `vars: { price: X }`                                          | var: `any`. A separate role from `modifier`, since vars are names that make a scope (topic 5)                                 |
| `as: X`                                                       | parameter, structural: `string`, literal only                                                                                 |
| the root                                                      | root: `any`. A host prop for an expected result type would fit here (topic 8)                                                 |
| `body: { name: X }`, `{ title: X, total: {…} }`               | data: `any`. Plain data inside an evaluated position is evaluated too (deep evaluation), so it can hold a reference or a node |

Rows with no slot: the `operator` and `fragment` rows (grammar), a shorthand's payload row (the argument list or the named payload, not a value delivered anywhere; an argument list's ＋ works out what a new element binds with `positionalLayout` at length + 1), the `vars` block itself (a map of names), quoted content and `//`. So a row has a slot exactly when it is evaluated.

**`ownerPath` is recorded, not derived,** because how far up the owning node is depends on its form, from one level to four: `P + ['decimals']` and `P + ['$not']` are one up, `P + ['$multiply', 0]` and `P + ['values', 0]` two, `P + ['entries', 0, 'key']` three, and `P + ['$buildObject', 'entries', 0, 'key']` four. The walk knows it as it passes; a consumer starting from a row would have to redo the walk's reasoning. Because nodes are anchored on their own object, `ownerPath` survives a conversion: "To full" on `{ $multiply: [...] }` moves its elements from `P + ['$multiply', 0]` to `P + ['values', 0]`, and their owner stays `P`.

**Slots are worked out in the classification walk,** recorded per path beside each row's kind (topic 1). The walk already visits every row top-down, carrying each node's shape, so resolving positions there costs almost nothing, and every consumer reads one answer. A row's slot can change when an ancestor changes and its own data does not (switching `round` to `upper` changes what `value` admits), so slot content is part of the map compared by content: a change passes a new `customNodeDefinitions` array and every row re-renders. Only structural actions change slots, so this is rare. Consumers that read at the moment of use, such as json-edit-react's `allowTypeSelection` function or a picker as it opens, read the current map from a ref.

- **Rejected: looking a slot up per row on demand,** from the parent's value and the kind map. It needs the classification anyway, repeats the walk's positional logic, and runs on every call.
- **Rejected: each consumer working it out for itself.** Four copies of the rules and four chances to disagree, which is how v1's `getTypeFilter` came to diverge from the evaluator.

**An element of an array parameter admits what the constraints say.** The metadata has no element-type declaration, and nearly every variadic parameter is a plain `array`. So an element admits the union of `constraints.homogeneous` where it is declared (`greaterThan`'s elements admit `['number', 'string']`), `object` where `constraints.elementShape` is (with a slot per field), and `any` otherwise. It admits `null` where the container declares an `elementNullPolicy` or `truthiness`, or where its type is `any`; `buildObject` declares neither, so a null entry is not admitted. This works for host operators unchanged and never goes beyond the metadata. The consequence, accepted: elements of `and`, `or`, `plus`, `equal`, `firstOf` and `join` admit `any`, so the type filter and the picker's ranking have nothing to act on there.

- **Rejected: an element-type vocabulary upstream.** It would be new engine semantics, checked per element at runtime, and most variadic elements genuinely accept anything, so it would buy little beyond `plus`.
- **Rejected: per-operator element tables in the editor.** They bring back the operator-specific knowledge v3 moved into metadata, and cannot cover host operators.
- `plus` declaring `homogeneous` on `values` would give its elements a real type (F5 in [v3-upstream.md](v3-upstream.md)). It is not needed now.

**An operator "cannot fit" a slot when its declared `returns` and the slot's `admits` share no value.** That is exactly `validate()`'s `returns-mismatch` check, so choosing such an operator would produce an error straight away, and the test must agree with `validate()` to the letter. Everything else can fit. References are untyped and fragments declare no `returns`, so both can always fit. How the picker treats operators that cannot fit (hidden, dimmed or listed last) is the operator picker's question. The test is fig-tree's `typesIntersect`, which is not exported (F6); without it the editor re-implements it, with a parity test against `validate()`'s `returns-mismatch` over every core operator at every typed parameter.

- **Deferred to the operator picker: a containment tier.** Telling operators certain to produce an admitted value (`round` at a number slot) from those that only might (`get`, `if`, `match`) matters only if the picker has a "Suggested" section. With the picker grouped by category, the two mostly follow the categories anyway.
- **Rejected: containment alone as the test.** It would count `get`, `if` and `match`, which return `any`, as not fitting at every typed slot, where they are among the commonest choices.

**The slot carries no preferences.** A `prefers` field was considered, for truthiness positions preferring `boolean` and an element of a homogeneous array preferring its siblings' type. It was rejected. Ordering is already served: at a truthiness position `categoryHints` lists Logic & control and Comparison first. Its one real use is seeding a new value, such as ＋ on `{ $min: ['apple', 'pear'] }`, where the plain starting-value rule gives `1` and breaks `homogeneous`; that belongs to the starting-value rules, which read the siblings and the `truthiness` flag when the value is created. And a preference drawn from siblings would change on every content edit of a sibling, re-rendering the whole tree, where a slot otherwise changes only on structural actions.

- **Rejected for now: passing the expected type down through operators such as `if`.** In `{ $round: { value: { $if: [c, X, Y] } } }`, `X` wants a number, but nothing declares that `then` and `else` become `if`'s result; it would need an upstream declaration, and fig-tree's spec lists that inference as maybe-later.

**Descriptions.** A row's tooltip is its declaration's `description`. Nine parameters in fig-tree 3.0.0-preview.1 have none (F7).

### The type dropdown — **Agreed**, except where marked

json-edit-react's type selector on a value row being edited, set through its `allowTypeSelection` function, which returns each row's options in display order: standard types, the names of definitions marked `showInTypeSelector`, and enums (`{ enum, values: string[], matchPriority }`). Collection rows have none (topic 1, finding 8). The editor's function is one rule: **a row with a slot gets the options its slot gives; any other row gets the six standard types.** Rows without a slot are exactly the unevaluated ones ("Slots"), so quoted content falls to the default with nothing further, and never offers an entry that would create something inert that looks live.

Options are listed in this order: the admitted types in declared order, the enum, then Data, Variable, Element, Parameter, Operator and Fragment where each is offered, then the row's current type if it is not already listed.

**Types map to options:**

| fig-tree type                                                                  | Options                                                                                                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `string`, `number`, `boolean`, `array`, `object`                               | the same type                                                                                                                           |
| `integer`                                                                      | `number`: json-edit-react has no integer input, so `2.5` can be typed and `validate()` flags it                                         |
| `any`                                                                          | all six standard types                                                                                                                  |
| a union                                                                        | each member, mapped, in declared order                                                                                                  |
| a literal union of strings                                                     | one enum, labelled "Option", with `matchPriority` set so a current value is recognised as it. The row's key already names the parameter |
| a literal union with non-string members (only a host operator can declare one) | each member's basic type, since an enum holds strings only; `validate()` catches values outside the union                               |

**`null` is offered exactly where the slot's `admits` names `null` or is `any`,** following fig-tree's type-driven admission. So `round.value` (`['number', 'null']`) and `greaterThan`'s elements offer it and `buildObject`'s entries do not; an optional parameter whose type excludes `null` (`round.decimals`, `http.method`) does not, since `null` there means unset and deleting the key is the honest way to unset it; an optional parameter whose type includes it (`get.default`, `noMatchDefault`) does, since `null` there is a real value. Rejected: offering `null` everywhere, which proposes values `validate()` rejects or that silently mean unset.

**References have entries of their own, one per namespace.** A reference is a string and is legal at every slot that is not literal-only, so at `round.value` the author must be able to enter `'$data.price'` although `string` is not admitted.

| Entry     | Namespaces                                        | Offered                                | Starts as                                                                                       |
| --------- | ------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Data      | `$data` (`$d`)                                    | at every slot that is not literal-only | `'$data.'`                                                                                      |
| Variable  | `$vars` (`$v`)                                    | where at least one var is in scope     | the first var of the nearest enclosing block, so it is valid at once (bare `$vars` is an error) |
| Element   | `$element`, `$index` (`$e`, `$i`), and `as` names | inside an iterator's `each` subtree    | the innermost element binding: `$element`, or `$order` under `as: 'order'`                      |
| Parameter | `$params` (`$p`)                                  | in fragment-definition mode (topic 6)  | the fragment's first declared parameter                                                         |

- **Each entry is its own named definition** (a Leaf, topic 1), sharing one component and differing in `name` and `condition`, which reads the namespace from the kind map (`recognizeReference`). json-edit-react shows a row's matching named definition as its current type, so a `$vars` reference shows "Variable", and a broken `'$vars.nope'` outside any scope still does. Scope comes from the scope chain the walk records (topic 1).
- **Choosing one keeps the input open for the path,** through json-edit-react's `editOnTypeSwitch`, which needs the definition to render json-edit-react's own string input while editing (`showOnEdit: true` with `passOriginalNode`). To be proved in Phase 7. If it cannot be, choosing Data commits bare `'$data'` (the whole data object, which is valid) rather than an incomplete `'$data.'`, and the author edits the row again.
- **Choosing `string` on a reference row keeps the text,** which is still reference-shaped, so the row stays a reference until its text is edited. Accepted: a string's meaning is what it says.
- Suggesting names while a reference is typed: do later ("Editing references", topic 5).
- **Rejected: offering `string` wherever a reference is possible.** At a number slot it presents literal strings as legal when `validate()` rejects them, and a reference row would show "string" as its type.
- **Rejected: references only where `string` is admitted,** and through raw JSON elsewhere. It blocks the commonest dynamic value at typed slots.

**Operator and Fragment are offered at every slot that is not literal-only,** Fragment only while fragments are registered. They are not hidden where nothing could fit: every operator declares a `returns`, so some operator nearly always can, and ranking is the operator picker's. `literal` has no entry of its own; it is reached through Operator and the picker, which lists it (topic 1).

**A new node starts as the default operator for its slot's type,** with its required parameters seeded, so the expression is legal from the start and the picker then opens on it (topic 2). "Operator"'s `defaultValue` is a function of the row, so it can do this. The built-in map, merged under a host prop (named in topic 8), maps each type to an operator name, seeded by the starting-value rule, or to a whole starting node:

| Slot type           | Default       |
| ------------------- | ------------- |
| `any`               | `plus`        |
| `number`, `integer` | `plus`        |
| `string`            | `buildString` |
| `boolean`           | `equal`       |
| `array`             | `map`         |
| `object`            | `buildObject` |

A slot finds its default by its type: an `any` slot the `any` entry; a basic type its own entry, `integer` falling back to `number`; a union its first non-null member with an entry, in declared order; a literal union of strings the `string` entry. If the operator found is not registered, or cannot fit the slot ("Slots"), the `any` entry is used, and if that cannot fit either, the first operator in category order that can. So a host's map can never create a node that is at once an error. A new node gets the canonical name (topic 2). Fragments declare no `returns`, so Fragment keeps one default, as v1's `defaultFragment`. The built-in choices are open to change.

**The row's current type is always listed,** last, when its slot does not admit it (a string at `round.value`, loaded from outside). Otherwise json-edit-react shows a select whose value is not among its options. The row's error state already says the value is wrong, and keeping it stays possible.

**Examples:**

| Slot                                              | admits                           | Options                                                                        |
| ------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| `if.condition`, `fallback`, a var, plain data     | `any`                            | string · number · boolean · null · object · array · Data · Operator · Fragment |
| `round.value`                                     | `['number', 'null']`             | number · null · Data · Operator · Fragment                                     |
| `round.decimals` (optional)                       | `integer`                        | number · Data · Operator · Fragment                                            |
| `regex.mode` (optional)                           | `'test' \| 'extract' \| 'match'` | Option · Data · Operator · Fragment                                            |
| a `greaterThan` element                           | `['number', 'string', 'null']`   | number · string · null · Data · Operator · Fragment                            |
| a `buildObject` entry                             | `object`                         | object · Data · Operator · Fragment                                            |
| `map.each`, where the node sits in a `vars` scope | `any`                            | the six standard types · Data · Variable · Element · Operator · Fragment       |
| `map.as`                                          | `string`, literal only           | string                                                                         |
| `useCache`                                        | `boolean`, literal only          | boolean                                                                        |
| quoted content                                    | no slot                          | string · number · boolean · null · object · array                              |

**Collection rows: raw JSON — Agreed.** A parameter holding an array or object (`values: [1, 2]`, `entries`, `body`) has no type dropdown, so turning it into a reference or a node goes through raw JSON, as in v1. A type selector for collection rows is logged as J6 in [v3-upstream.md](v3-upstream.md), Maybe, to revisit once the editor is in use.

### The operator picker — **Agreed**, except where marked

The searchable list opened from a full node's toolbar (A3 and section J in the mockups). Topic 2 fixed its behaviour: one entry per operator, re-selecting the current entry toggles its spelling, and switching keeps the parameters the new operator also declares. "Slots" supplies the test for operators that cannot fit, and "The type dropdown" the operator a new node starts as.

**Groups and order.** One group per category, in `categoryHints` order, headed by the category's display name; empty groups are hidden (I/O on an instance without I/O operators). Within a group, operators keep `getOperators()` order: fig-tree's canonical order for the core operators, and host operators wherever the host's `operators` array puts them (a host that passes `operators` includes `coreOperators` itself, so it controls the order). `literal`, which the editor supplies, goes in Data & objects, since it produces data verbatim.

- **Rejected: alphabetical by display name,** which breaks the canonical sequences (`and`, `or`, `not`, `if`; `plus`, `subtract`, `multiply`, `divide`) and scatters related operators.
- **Rejected: core operators first, then host operators,** which goes against the first-class principle (topic 1) when the host already controls the order.

**Host operators** have no marking and no group of their own; `category` is required on every definition, so they sit where authors look. Display data is layered, lowest first: the editor's built-ins (only `literal`), `./editor-hints`' `operatorHints`, the definition's `metadata` read as `OperatorHints`, then a host override prop (topic 8). A host operator with no display name shows its canonical name, and one with no colours takes a generic default, chosen in topic 8.

**Search** matches the display name, which carries the alias ("Plus (+)"), the canonical name, and the category name (typing "math" shows the whole group, as `Select` does with group labels). It does not match descriptions: "number" appears in most math descriptions, so they would bury the entry being looked for. Groups stay while searching, with empty ones hidden. After each keystroke the first match in list order that can be chosen is highlighted, so a symbol or name then Enter picks it; the list order already puts the likely operator first (`>` gives Greater than, `=` gives Equal).

- **Do later: a ranked best match,** exact name, alias or display name first, then a prefix of any of them or of a word in the display name, then a substring, ties in list order. It needs a scoring hook in `Select`.
- **Rejected: flattening results into one ranked list while searching,** which moves entries between two layouts as the author types.

**Operators that cannot fit the node's own slot** (their declared `returns` shares no value with what the slot admits, so `validate()` would report `returns-mismatch` at once) move to a final "Not valid here" group, cannot be chosen, and show their reason in place of the description ("Returns a string; this position takes a number or null"). Search still finds them. At an `any` slot nothing moves. The current operator stays in its own group and can be chosen even if it cannot fit (a loaded expression, or a parent that changed), so re-selecting it still toggles its spelling; its error comes from `validate()`. At `round.value` (`['number', 'null']`) with the core operators, 20 of 40 move, and Comparison disappears as a group (mockup J1).

- **Rejected: hiding them,** which leaves an author searching for "lower" at a number slot with no result and no reason.
- **Rejected: listing them last but choosable,** which breaks topic 2's rule that the structured path always leaves a node valid.
- **Rejected for now: a "Suggested" section** of operators certain to produce an admitted value ("Slots" left it to this question). At typed slots those mostly fill one category anyway (Arithmetic at a number slot), and the section would list each of them twice. Easy to add later.
- **Sharing only `null` counts as fitting — Agreed.** Any operator that can return `null` can fit any slot that admits `null`, so `regex`, whose `returns` includes `null` from `noMatchDefault`, stays under Strings at `round.value`. The picker stops only what `validate()` would reject: a stricter picker would refuse something the author can still write in raw JSON with no error, and the choice can be deliberate (`regex` in `extract` mode gives `null` on no match, which `round` propagates).

**Where it opens.** On a new node, with the slot's default operator selected and the search field focused (topic 2), so typing filters at once. On a broken node (`{ operator: 'plsu' }`), with no current entry, and with `validate()`'s suggested name highlighted where fig-tree supplies one machine-readably, so the pencil then Enter repairs it, keeping `values` under topic 2's switch rule. The suggestion is in the message text today, so F3 in [v3-upstream.md](v3-upstream.md) extends to `unknown-operator`, `unknown-fragment` and `unrecognized-identifier`. Without it nothing is highlighted and the author searches.

**Each entry** shows the display name and the description. The current entry carries the spelling-toggle hint as part of its label text ("Multiply (*) ⇄ select again to write as *"), which needs no change to `Select`.

**Changes to `Select` for the first build — Proposed.** The smallest set that makes the picker work, all additions, since `Select` is exported:

1. **A disabled state on options,** skipped by click, Enter and the arrow keys, and styled as unavailable. Group headers use it too: today a header can be selected (`handleSelect(group)`), which would choose a category.
2. **A fix for keyboard highlighting in grouped lists.** Each option compares the highlighted index with its index inside its own group, so ↓ highlights the first option of every group, and Enter picks from the flattened list, which may not be the option that looks highlighted.
3. **Highlighting the first match that can be chosen** after each keystroke, where today the highlight resets.
4. **Extra search terms on each option** (`searchTerms`), checked by the one matching function, to hold the canonical name. Without it, typing `if`, `greaterThan` or `buildString` finds nothing, since only the display label is matched.

**Do later: other changes to `Select`.** Category colour swatches on group headers, the canonical name as a second label (A3's monospace column), the ranked best match above, and descriptions cut to one line with the full text on hover.

**For topic 8:** a prop to hide operators from the picker without unregistering them, for a host that keeps an operator evaluable but does not offer it to authors.

### Adding parameters and starting values — **Agreed**, except where marked

**"Parameter", not "property".** The editor's word for an operator's or fragment's declared inputs is fig-tree v3's: the declarations, `getOperators()`, the specs and `validate()`'s messages ("'thn' is not a parameter of 'if'") all say "parameter". v1 said "property", which is JSON's word for any key, `fallback` and `vars` included. The toolbar control is labelled "Add parameter", and lists the modifiers in a second group. A fragment call's argument map is also called `parameters`, and its entries are the fragment's declared parameters, so the label holds on both kinds of node.

**What "Add parameter" offers:**

| Node                  | Offers                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full operator         | its declared parameters not yet present, then the modifiers not yet present: `//`, `fallback`, `useCache`, `vars`                                               |
| Static fragment call  | its declared parameters not yet present, written into `parameters` (created if absent), then the modifiers except `useCache`, which fragment calls do not allow |
| Dynamic fragment call | the modifiers only, since its arguments are computed                                                                                                            |
| `literal`             | `//` only: `fallback`, `vars` and `useCache` are legal there, but `validate()` warns that each is dead                                                          |

- **A missing required parameter is listed first, marked required.** Fill-in normally adds it, but it can be missing where the typo guard held it back (`thn` beside a missing `then`) or a raw-JSON edit removed it.
- **Two groups, Parameters and Modifiers,** with headers that cannot be selected ("The operator picker").
- **Each entry is labelled with its key exactly as it will appear in the tree** (`nullValueDefault`, `fallback`), with its description beneath: the declaration's for a parameter, and the editor's own for a modifier (`fallback`: "The value to use if this node fails"; `useCache`: "Cache this node's result"; `vars`: "Named values for this node and everything inside it"; `//`: "A note, never evaluated"). How required, defaults and the rest are shown is "Parameter metadata", below.
- **json-edit-react's ＋ on the node's row offers the same list by name** (`newKeyOptions` takes names only), as topic 2 decided.
- **Nothing is left out for being unwise.** `body` is offered beside `method: 'get'`, and `validate()` reports the conflict.

**The starting-value rule.** One function gives the value of everything the editor creates: a parameter added from the picker or ＋, a required parameter fill-in completes, an element added with ＋, a row switched to Value (topic 2), and the parameters of a new node's default operator ("The type dropdown"). For a declared parameter of an operator or fragment, it is `./editor-hints`' rule:

1. **Its seed**, from the layered display data ("The operator picker"): `operatorHints` for core operators, the definition's `metadata` for host operators, `FragmentHints` for fragments, then the host's override prop.
2. **Otherwise a value for its declared type:** a literal union's first member; for a union, the type seed of its first non-null member; otherwise the type's `typeSeeds` entry.

The runtime `default` is deliberately not a step, because a parameter is usually added to change it. For the same reason, **a boolean or literal union never starts at its effective default** (`instanceDefault ?? default`): where the rule gives exactly that value, a boolean starts as its negation and a literal union at its first member that is not the default. With the core metadata this changes `regex.mode` (`'test'` to `'extract'`), `http.method` (`'get'` to `'post'`) and `sql.shape` (`'rows'` to `'firstRow'`), and any parameter whose `instanceDefault` equals its starting value. The result is still a legal value, so fig-tree's drift tests hold, and the rule is documented on `OperatorHints.seeds` as the editor's to implement.

Examples:

| Parameter                                 | Starting value            | From                                                                |
| ----------------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `if.then`                                 | `'The condition is true'` | the seed                                                            |
| `round.decimals`                          | `2`                       | the seed                                                            |
| `split.trim` (default `true`)             | `false`                   | the seed                                                            |
| `http.timeout`                            | `5000`                    | the seed; the `integer` type seed of `1` would expire every request |
| `equal.caseInsensitive` (default `false`) | `true`                    | the `boolean` type seed                                             |
| `plus.expect`                             | `'number'`                | the literal union's first member                                    |
| `plus.nullValueDefault`                   | `1`                       | the type seed of the first non-null member                          |
| `find.noMatchDefault`                     | `'Replace me'`            | the `any` type seed                                                 |
| `regex.mode` (default `'test'`)           | `'extract'`               | not the default                                                     |

**The modifiers** start as: `//`, `'Comment...'` (never evaluated, so an unedited note is harmless); `fallback`, `null`, the common "degrade to null"; `useCache`, the negation of its effective value (`instanceUseCache ?? the useCache option ?? the definition's useCache`), so `false` on `http`; `vars`, `{}`, whose ＋ then asks for a name.

**An element added to an array — Proposed.** Editor-hints' seeds are for whole parameters, so a new element needs its own rule, in this order:

1. **In a homogeneous array, the type seed of the type its literal siblings share,** so an add never breaks the constraint: ＋ on `{ $min: ['apple', 'pear'] }` gives `'Replace me'`, not a number.
2. **An element of the parameter's seed:** the seed's element at the new index if it has one, otherwise its last. So `and.values` gives `true`, `or.values` `false`, `plus.values` `[1, 2]` gives `3`, `join.values` `'Charlie'`, and `buildObject.entries` its seeded entry. A positional payload's elements bind a parameter, so `{ $and: [...] }` gives `true` too.
3. **The type rule for what the element admits,** an `elementShape` giving an object with each required field started by the same rule (`{ key: 'Replace me', value: 'Replace me' }`).

A positional element added with ＋ starts as the parameter it would bind would ("Slots"). Rejected: a special case making truthiness positions start as `true`, which this rule makes unnecessary: the core truthiness parameters all have seeds, and a host operator that wants something better than `'Replace me'` gives its own.

**Key order.** Fill-in orders a node's parameters by `positionalParams` first, then the rest in declared order: `map` becomes `input, each, as, nullInputDefault`, `get` becomes `path, default, from`, `plus` becomes `values, expect, nullValueDefault`. An operator without `positionalParams` uses declared order. The `…Default` parameters land after the main inputs on every core operator without a rule of their own. The picker lists missing parameters in the same order. It is enforced on every update, raw-JSON submits included, since reordering removes nothing: key order carries no meaning in FigTree, it undoes the reordering a database applies (Postgres `jsonb` stores keys in its own order, which is why v1 sorted them), and every node reads the same way. It applies to node keys only; plain objects, `vars` blocks and quoted content keep their order.

- **Rejected: declared order,** which for the iterators puts `each`, the main expression, after two named-only options.
- **Rejected: asking fig-tree to reorder its declarations,** which would fix only the core operators, when the rule above needs no change upstream.

**Adding `as` renames nothing.** An iterator's `as` renames its bindings (`$element` to `$item`, `$index` to `$itemIndex`), but the editor leaves the references in its `each` as they are, and each one that no longer resolves shows its error. Renaming them correctly needs fig-tree's scoping (innermost wins, nested `as`) and its template-token grammar (`{{$element.name}}`), which the editor will not reimplement. In nested iterators, adding `as` to the inner one leaves its `$element` references resolving to the outer iterator's element, with no error; `validate()`'s dead-binding warning on the inner iterator (an `each` that reads none of its own bindings) is what shows it.

- **Do later: an "Update references" quick fix on the `as` row,** an opt-in rename, designed with the same fix for vars ("Renaming a var", topic 5) on a rename helper in fig-tree's `./format` (F8 in [v3-upstream.md](v3-upstream.md)).
- **Rejected: treating any change of `as` as a rename,** for the complexity above.

### Parameter metadata — **Agreed**

Mocked up as section K of the mockups.

**A hover card on each parameter's key.** json-edit-react definitions can carry a `keyComponent`, which replaces a row's key label and receives its data, path and rename handlers, so a key can show a card on hover while keeping json-edit-react's rename (double-click) and click behaviour. The card is a popover: it floats over the rows beneath it and never changes the tree's layout. This follows topic 3's rule that the tree stays uncluttered while read, with details on hover. It serves full nodes, named shorthand payloads, fragment arguments and modifiers.

- **Every definition that can sit at a parameter row carries the same key component,** since a row takes only its first matching definition's. A final catch-all definition carrying only the key component covers rows with a slot and no other definition (plain values, plain arrays). To be proved when built.
- **Array elements have no card.** With indexes hidden, json-edit-react renders no key for an element (`showLabel` is false), so there is nowhere to attach one. **Do later**, with J7 in [v3-upstream.md](v3-upstream.md), which would also allow topic 1's dimmed parameter names on positional elements.
- **Rejected: always-visible text or badges on rows,** which clutter every node. **Rejected for now: a side panel for the selected parameter,** a larger piece of UI, to reconsider if hover proves too hidden.

**What the card says.** A first line with the name, "required" or "optional", and what it takes; then the declaration's description; then each of these lines only where it applies:

| Line        | From                                             | Wording                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Takes       | the slot's `admits`                              | "a number or null"; "one of 'test', 'extract', 'match'"; "anything"                                                                                                                                                                                                                                                                                                                             |
| Elements    | `constraints`                                    | "exactly 2"; "all numbers or all strings"; "each an object with `key` and `value`"                                                                                                                                                                                                                                                                                                              |
| Default     | `default`, `instanceDefault`                     | "Default: 0"; with a host override, "Default here: 2 (set by this application; FigTree's is 0)"; `get.from`'s sentinel as "the evaluation data"                                                                                                                                                                                                                                                 |
| Evaluated   | `evaluation`, when not eager                     | lazy: "only when needed"; per element: "once for each element of `input`, with `$element` and `$index` available" (the `as` names where set); race: "all at once; stops as soon as the answer is known"; lazy elements: "each only when needed, in order"; lazy entries: "only the matching entry"; structural: "a name, not an expression, so it can't be computed"                            |
| If null     | the type, `nullPolicy`, `required`, `truthiness` | propagate: "the result is null"; truthiness: "counts as false"; a required parameter whose type excludes `null`: "an error"; an optional one: "means 'not set', so the default applies"; element policies: "a null element makes the result null" or "null elements are accepted"; `convert.value`'s conditional policy: "if `to` is 'boolean', null gives false; otherwise the result is null" |
| Replacement | `replacesNullAt`                                 | on the replacement: "Used in place of a null in `values`"; on its target, the null line adds "unless `nullValueDefault` is set"                                                                                                                                                                                                                                                                 |

- **The null line is omitted where null is nothing special,** a parameter typed `any` whose null is an ordinary value. fig-tree reports `nullPolicy: 'propagate'` on lazy `any` parameters such as `if.then` and `map.each`, but `propagate` is inert on any parameter that is not eager (fig-tree's operator contract), so the card reads their null as a value.
- **The wording is the editor's, generated from metadata,** so host operators get the same cards. The Evaluated line is shown even where the description says the same (`map.each`: "Evaluated per element, with $element and $index bound"), since it is the one line worded the same across every operator. Whether hosts can replace the wording, for translation as json-edit-react's `translations` allows, is for topic 8.

**No persistent marker for required or optional.** The card says it, required parameters already have no ✕ (topic 2's guards), and modifiers already look different (topic 3). Rejected: an asterisk or bold key on required parameters, or muted optional ones, which style every row for a distinction rarely needed while reading.

**The operator's own card**, shown on hovering the node's operator button (whose click still evaluates), carries topic 3's description tooltip and the `docUrl` link, and gains a line for the host's defaults for that operator, since they change behaviour without appearing in the tree: `instanceFallback`, `instanceUseCache`, and `instanceDefault` on any parameter the node does not set ("This application sets `fallback: null` and `timeout: 5000` on every `http` node that doesn't set its own").

**The add-parameter picker** shows each entry's description with "Default: …" appended to the same text, so `Select` needs no change ("Adding parameters and starting values").

**The `…Default` parameters get nothing of their own.** The Evaluated line says when they fire, the Replacement line ties an engine-applied default (`nullValueDefault`, `nullInputDefault`) to its target in both directions, and key order already puts them last. That covers fig-tree's two mechanisms, defaults the operator reads itself and defaults the engine applies, without the author needing to know which is which.

### Array constraints — **Agreed**

How topic 2's guards apply to arrays with declared constraints, and the rule behind every guard.

**The rule: the editor blocks an edit only where the metadata declares it,** as a required parameter, a fixed length, a positional binding or a literal-only position, **and only where the block leaves a valid next step. Everything else is allowed and reported by `validate()`** (topic 7). It decides cases not listed here. It also keeps editor-only machinery small: a guard reads what the slot already records, and anything that would need a rule of the editor's own is left to `validate()`.

- **A fixed length blocks only moves away from it.** With `constraints.length: 2`, an array with more elements can lose one but not gain one, an array with fewer can gain one but not lose one, and an array of exactly two can do neither. An array loaded at the wrong length is then fixable in the tree, not only through raw JSON.
- **Deleting the last element of an aggregate stays allowed.** `plus.values: []` is a `validate()` error, and `and`/`or`/`multiply` with `[]` a dead-expression warning, but "not empty" is enforced by each operator's own `validate` hook rather than declared, so the editor cannot read it. Rejected: asking fig-tree for a declared `constraints.minLength`, which would move the empty-aggregate checks out of every hook for little benefit.
- **The required fields of an `elementShape` element cannot be deleted** (`buildObject`'s `key` and `value`). They are slots with `role: 'field'` and a declaration marking them required ("Slots"), so the check that guards a required parameter guards them with no extra code, and json-edit-react's rename rule (a key that cannot be deleted cannot be renamed) follows. ＋ on an entry stays json-edit-react's free-typed key: offering only the missing fields would need a case of its own, and fig-tree ignores extra keys in an entry.
- **Changing an element's type so that it breaks `homogeneous` is allowed** (`18` to a string in `greaterThan`'s `['$data.age', 18]`). It is a content edit, `validate()` reports it, and the author may be about to change the other element too.
- Unaffected: arrays supplied dynamically (`values: '$data.list'`) have no element rows to guard; reordering does not change a count; positional payloads keep topic 2's rules, and deleting the last element of `{ $and: ['$data.x'] }` leaves `[]`, allowed as above.

---

## 5. References and `vars`, then comments and `literal`

### The vars block — **Agreed**

A `vars` block on an operator node, a fragment call, a shorthand node or a plain object. Earlier topics fixed its place and look: last among a node's keys, in the `$vars` colour and set slightly apart from the rows above (topic 3), `{ 2 vars }` when collapsed (topic 3), created as `{}` by "Add parameter" or the node's ＋ (topic 4), and each var a slot admitting `any` (topic 4).

**Drawn by the theme, with no component of its own.** json-edit-react renders the block as the plain collection it is, with its own edit tools (✎ for raw JSON, ＋, ✕). The editor's theme style functions, which receive each row's data and read the kind map, colour the `vars` key and give the block its left rule and tinted background, and `customText` gives the collapsed summary. The `vars` key carries topic 4's hover card, with the modifier's description ("Named values for this node and everything inside it"). So topic 1's "Node (Vars)" definition becomes none, with theme styling, as for `fallback` and `useCache`.

- Whether a collection's style can draw the rule and tint down the whole block is to be proved in Phase 8. If it cannot, the fallback is a Vars component that only wraps the child rows, with no caption.
- Rejected: a Vars component with a caption line ("vars · for this node and everything inside it"). Always-visible text goes against topic 3's uncluttered tree, and the hover card already says it.

**Var names are plain json-edit-react keys.** Only the `vars` key takes the `$vars` colour. The vars are ordinary rows, sitting on the block's tint, which already marks every row in it as a declaration. Rejected: names in the `$vars` colour to match their uses (`country` and `$vars.country`), which styles content the tint already sets apart.

**Adding a var takes two steps.** "Add parameter → `vars`" (or the node's ＋) creates `vars: {}`, then the block's ＋ asks for a name. json-edit-react cannot open an add-key input from code, since `startEdit` on its handle opens value edits only, and its edit tools appear on hover only, so an empty block gives no cue. Accepted for now.

- Rejected for now: asking json-edit-react for a `startAdd({ path })` on its handle, so that creating a block opens its name input at once (J8 in [v3-upstream.md](v3-upstream.md), dropped). To revisit if the two steps prove awkward in use.
- Rejected: seeding a new block with one var under a generated name (`var1`), which the author has to rename by double-clicking the key, and which is the kind of name that gets left in.

**A new var starts as `'Replace me'` and opens for editing.** The value is the starting-value rule's for an `any` slot. Once the add commits, the editor calls `editorRef.startEdit` on the new var's path, so the author types the value or picks Operator, Data and the rest from the type dropdown straight away, as a new node's picker opens straight away (topic 2). The editor holds its own `editorRef` for this, merged with the one the host passes through (topic 2, "Reporting state to the host"). Until something reads it, a new var carries `validate()`'s `unreferenced-var` warning, which is true, so it stays. Rejected: leaving the new var closed, as json-edit-react leaves any other add.

**Names are checked by `validate()`, not at entry,** as topic 2's guards already say of a vars block's ＋. An illegal name (empty, containing `.`, `[` or `]`, or starting with `$`) is accepted and shows `invalid-name` on its row, and renaming the key fixes it. json-edit-react already refuses a duplicate. A `//` typed as a name makes a comment rather than a var, as the grammar says. Rejected: refusing illegal names in `onUpdate`, which would copy fig-tree's rule into the editor or need fig-tree to export a checker.

**Placement and order.**

- On operator nodes, fragment calls and shorthand nodes, the fill-in step puts `vars` last among the node's keys (topic 1). On a shorthand node it is a sibling of the `$name` key. The editor never writes `vars` inside a named payload, where `validate()` reports it as `unknown-node-key`.
- On a plain object it stays where it was written, since fill-in orders node keys only (topic 4). json-edit-react's ＋ appends, so a block created in the editor lands last anyway. It looks the same as on a node. Rejected: moving it last as on nodes, which would not change the output (the key is consumed) but would make fill-in reorder plain objects.
- `vars` added through a plain object's ＋ starts as `{}`, not the `any` seed `'Replace me'`, which `validate()` would report as `invalid-vars`. The editor's `defaultValue` function reads the kind map, where a `vars` key on an evaluated plain object is a scope.
- A malformed block (`vars: [1]`, `vars: 'x'`) renders as a plain row with its `invalid-vars` error, without the block's styling. Inside a `literal` or a `//` value, `vars` is plain data.

**Do later: "Move into a var."** An action that moves a node into a new var under a name the author types, leaving `$vars.name` in its place. It is an occasional task, so it has no control of its own: holding Cmd (Ctrl on Windows and Linux) changes the node's conversion button to "To var", as json-edit-react's copy button copies the path instead of the value while Cmd is held. The same trigger could apply to a reference row's "→ get". To settle when it is built:

- which block receives the var: the nearest enclosing one, or a new one on the enclosing node;
- refusing a move that would take a binding reference above its iterator, such as a subtree that reads `$element`;
- a route for touch and keyboard users, who have no modifier to hold.

### Showing scope — **Agreed**

**The author is expected to know the basic rule, and the editor shows only where a reference breaks it.** There is no scope-specific UI. Every scope mistake is a `validate()` issue at the path of the row concerned, so topic 7's ordinary row error state shows it:

- on the reference: `unresolved-var` (`'$vars.nope'`), `bare-vars` (`'$vars'`), `unresolved-binding` (`$element` or an `as` name outside its `each`) and `unresolved-param` (`$params` outside a fragment body);
- on the var: the warnings `unreferenced-var` and `shadowed-var`, and the error `var-cycle`.

That covers every place a reference sits: a bare string, a `get` node's `from` (`'$vars.row'`), and a `{{$vars.n}}` token in a `buildString` template, whose issue points at the template string. The rule itself is stated on the `vars` key's hover card ("Named values for this node and everything inside it"), and any suggestions offered while a reference is typed are names in scope, which teaches it as the author types.

**So the classification walk records scope chains only** (topic 1), not which block each reference resolves to. The chain is enough for the type dropdown's Variable and Element entries, for sub-tree evaluation and for suggestions. Whether renaming a var needs per-reference resolution is the rename question's.

Rejected, each needing that resolution on every update for little benefit to an author who knows the rule:

- hovering a reference to highlight the var it reads, or a var to highlight its uses;
- a "defined here" jump from a reference to its declaration;
- a use count or "unused" marker on each var row, which `unreferenced-var` already covers.

### Editing references — **Agreed**

**References are written by hand, as strings.** The type dropdown's Data, Variable, Element and Parameter entries start a reference with its namespace (topic 4), and the author types the rest of the path. A path into the data can be copied rather than typed: Cmd-click (Ctrl-click) on json-edit-react's copy button copies a node's path instead of its value, in dot-and-bracket form (`users[0].name`), which is the reference path grammar, so it pastes straight after `$data.`. A path that starts at an array index copies as `[0].name` and pastes straight after `$data`. This works wherever the host shows its data in json-edit-react, as the demo does. A key containing `.`, `[` or `]` has no reference form either way, and is read with `get`.

**The reference definitions render json-edit-react's own input while editing.** They need `showOnEdit: true` only so that choosing an entry in the type dropdown keeps the input open for the path (`editOnTypeSwitch`, topic 4), and while editing their component renders the standard input it is passed (`passOriginalNode`) unchanged. json-edit-react keeps the key label, ✓ ✗ and the type selector outside the component, as on any value row.

**Do later: suggestions while a reference is typed,** if hand-written references prove error-prone. What was considered, for picking it up:

- an editor built from json-edit-react's exported `StringEdit`, with a completion list beneath it whose keys (↑ ↓ Tab Enter Esc) are handled before json-edit-react's;
- at the namespace, only the namespaces valid at the row; after `$vars.`, the vars in scope from the scope chain, innermost first, shadowed and self-referencing names left out; after `$params.`, the declared parameters; after `$data.`, the paths the expression already reads (`getDependencies()`) and keys from the host's sample data;
- a "No var 'nop' in scope" line when nothing matches, as an early warning before commit;
- reference rows only at first, then every string row in an evaluated position (a definition with `showOnView: false`, so it takes over only while editing).

Rejected outright: suggesting keys inside a var's value, which would mean evaluating the var, possibly over the network.

### Renaming a var — **Agreed**, except where marked

**Renaming a var renames nothing,** as adding or changing `as` renames nothing (topic 4). The key is renamed with json-edit-react's own rename, each reference that no longer resolves shows its `unresolved-var` error, and a var nothing reads any more shows `unreferenced-var`.

**Do later: an "Update references" quick fix,** to be reconsidered once the built editor can be tried. After a var rename or an `as` change breaks references, the renamed row and its line in the messages area would offer "Update 2 references", until the next edit, computed from the tree before the rename (which json-edit-react's `onUpdate` passes with its `rename` event). What it has to do, for picking it up:

- **Vars:** update every reference that read the renamed declaration: reference strings anywhere in its scope, a `get`'s `from`, the block's own sibling vars, and `{{$vars.…}}` tokens in `buildString` templates (rewriting only the token). References that read a shadowing inner var are left alone, quoted content is skipped, and a short spelling is kept (`$v.country` to `$v.nation`).
- **`as`:** changing it renames `$order` and `$orderIndex` inside that iterator's `each`; adding it renames the `$element` and `$index` (and `$e`, `$i`) that resolve to that iterator, not those inside a nested iterator without `as`; removing it renames them back, except inside a nested iterator without `as`, where the outer element has no name and the references keep their errors.
- **Capture is refused.** Where the new name is declared closer to a reference, rewriting it would silently read the wrong var, so that reference is left with its error and the fix says why ("`nation` is declared closer"). The reverse case, an inner var renamed to an outer var's name, silently captures references with no text changing; no rename tool can repair it, and `validate()`'s `shadowed-var` warning is the signal.

**It would be built on a fig-tree helper** in `./format` (F8 in [v3-upstream.md](v3-upstream.md)), which already has the pieces: its static checks resolve each reference to its declaring block, and its compiler turns template tokens into reference nodes with paths. The same helper would serve renaming a declared fragment parameter in fragment-definition mode (topic 6).

- Rejected: resolving references and rewriting them in the editor, which needs fig-tree's unexported template-token grammar, re-implements its resolution rules behind a parity test, and gives the classification walk per-reference resolution it otherwise does not need ("Showing scope").
- Rejected: textual find-and-replace within the block's subtree, which is wrong under shadowing and nested iterators.
- Rejected: asking at rename time whether to update references, which would hold json-edit-react's rename commit open behind a dialog and interrupt renames that break nothing.

### Comments — **Agreed**

A comment's value is quoted content, so it stays plain json-edit-react data, edited with json-edit-react's own tools. The editor only styles it as a note (topic 3: under the header, edit tools on hover).

**A string comment** is a value row. **A multi-line comment** (`'//': ['line 1', 'line 2']`) is a plain json-edit-react array, one row per line, each line edited in json-edit-react's own input, with the array's ＋ adding a line and its ✕ deleting the comment. The theme gives the array the look of one note block. Going from one line to several is the comment row's type dropdown ("array", which json-edit-react turns `'x'` into `['x']`, then ＋), or Shift-Enter inside the string, which the note's `white-space: pre-wrap` shows as a line break. Going back to a single string takes raw JSON, since collection rows have no type dropdown.

- **Each line has a thin view-only definition:** json-edit-react's exported `StringDisplay` with quotes off and no truncation, since json-edit-react writes a string's quotes as literal text, which CSS cannot remove, and cuts strings off at `stringTruncateLength`. With `showOnEdit: false`, editing is json-edit-react's own input. The same definition serves a string comment.
- **The array keeps its json-edit-react header row,** which is where its ＋ and ✕ are: flattening it would lose both. A definition with `showKey: false` and no component, and the theme hiding its chevron and brackets, leave that row holding only the hover tools. Whether CSS can fold it into the block's top edge is proved in Phase 8, with the vars block's tint.
- **Comments never start collapsed.** A multi-line comment is one level deeper than its node's parameters, so at the host's `collapse` depth it would open as `[ 2 items ]`. The editor wraps the host's `collapse` filter to keep comment rows open.
- Rejected: drawing the array as one note through `renderCollectionAsValue`, which needs an editor of the editor's own. json-edit-react has no editor for an array on a value row, so with `showOnEdit: false` its "invalid value" input appears. The component would join the lines into one textarea and split them on commit (`fromStandardType`).
- Rejected: editing a multi-line comment only through its node's raw JSON.

**Other values** (`'//': { ticket: 123 }`, which the grammar allows) render as plain json-edit-react data with the `//` key's modifier styling and no note style, and edit like any data. Rejected: showing them as JSON text inside a note.

**A new comment opens for editing.** "Add parameter → `//`" (or the node's ＋) adds `'Comment...'` (topic 4) and opens it for editing at once, as a new var does, since the placeholder is only there to be replaced. A line added with the array's ＋ starts and opens the same way.

### `literal` — **Agreed**

Topics 1, 3 and 4 settled its display (the editor's own display name, description and colour, since `literal` has no `getOperators()` entry and no `operatorHints` entry), its place in the picker (Data & objects), its content as plain data with no badge, and "Add parameter" offering only `//` on it.

**A new `literal` starts with an explanatory string:** `value` is `'No content inside a literal node is evaluated'`, so the placeholder says what the node is for. It is the seed in the editor's own display data for `literal`, which the starting-value rule reads first (topic 4), and it would move into fig-tree's entry if F4 in [v3-upstream.md](v3-upstream.md) lands. A string is harmless as content: it evaluates to itself. Rejected: the `any` type seed `'Replace me'`, which says nothing about the node.

**Do later: "Quote" and "Unquote",** actions that wrap a node or subtree in `literal`, or unwrap one, without going through raw JSON. To be reconsidered once the built editor can be tried.

---

## 6. Fragments

### Fragment-definition mode — **Agreed in principle** (details below are for this topic)

The editor is also used to author fragment definitions (Conforma does). A host prop, working name `isFragmentDefinition`, puts the editor in that mode, so the rules that apply only inside a fragment body (`$params` above all) are switched on explicitly rather than inferred. Authoring a fragment is a distinct task, and the host always knows when it is doing it.

To settle in this topic:

- **What the editor edits:** the body (`expression`) alone, with the declared parameters passed in by the host, or the whole definition wrapper (`{ expression, parameters, description, metadata }`), declarations included. Most of the rest depends on it.
- **`$params`:** the Parameter entry in the type dropdown ("The type dropdown", topic 4) and its scope, the declared parameters.
- **Validation:** checking the body as registration will (undeclared `$params` references, unknown names, cycles), and whether `validate()` can do that today or needs an upstream option.
- **The fragment picker:** never offering the fragment being defined, or any fragment whose use would close a cycle, since recursion is banned.
- **Sub-tree evaluation:** sample arguments for `$params`, from the host or from the editor.
- **Display:** the fragment's own `FragmentHints`, if the wrapper is edited.
