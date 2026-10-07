# fig-tree-editor-react v3 — design

_Working document for Phase 3 of [v3-plan.md](v3-plan.md). It records what the v3 editor looks like and does, topic by topic, with the reasoning behind each decision and the options rejected. Sections marked **Agreed** are settled, **Proposed** ones are drafted and awaiting a decision, **Parked** ones have been discussed and deliberately set aside to revisit later, and **Open** ones have not been discussed yet. **Findings** record what an upstream package does, checked against it, and a **Summary** gathers decisions made elsewhere._

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

| Kind                        | Example                                              | Notes                                                                                                                                  |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Operator, full              | `{ operator: 'plus', values: [1, 2] }`               | A broken node (unknown operator name, or a malformed node) is a state of this kind, rendered so the author can fix it from the header. |
| Fragment call, full         | `{ fragment: 'greet', parameters: { name: 'Ada' } }` | Two variants, below.                                                                                                                   |
| Shorthand, named (operator) | `{ $if: { condition: c, then: a, else: b } }`        |                                                                                                                                        |
| Shorthand, named (fragment) | `{ $greet: { name: 'Ada' } }`                        | Fragments have no positional form.                                                                                                     |
| Shorthand, positional       | `{ $plus: [1, 2] }`, `{ $not: '$data.x' }`           | Operators only. Includes the single-value payload.                                                                                     |
| Literal, full               | `{ operator: 'literal', value: X }`                  | Grammar rather than an operator, so it has no `getOperators()` entry (below).                                                          |
| Literal, shorthand          | `{ $literal: X }`                                    | The payload is the content, never named or positional.                                                                                 |
| Bare reference              | `'$data.user.name'`                                  | A string leaf, in any of the five namespaces.                                                                                          |
| Plain container with holes  | `{ title: '$data.name', total: { $plus: [...] } }`   | Plain data that contains evaluable nodes. Gets a bare Evaluate button with no toolbar, as v1 does, at the root only for now (topic 3). |
| Plain data                  | anything else                                        | Untouched json-edit-react content.                                                                                                     |

**Fragment call variants.** A full fragment call's `parameters` is either a static map, rendered as named arguments with the fragment's declared parameters available to add, or dynamic: a reference or node that computes the whole arguments object (`parameters: '$data.formValues'`). A dynamic call has no argument rows to offer, since its arguments are checked at runtime, and it has no shorthand form, so "To shorthand" is not offered on it. The fig-tree spec suggests badging dynamic calls; the editor does not, since `parameters` there is just a property with a value (topic 3).

**`literal` is grammar, not an operator.** It is absent from `getOperators()`, which covers the 40 operator definitions, so an Operator component would find no description or parameter declaration for it. Its display data (display name, `docUrl`, colours and the seed for `value`) is its entry in `./editor-hints`' `operatorHints` (F4 in [v3-upstream.md](v3-upstream.md)), and the editor supplies its description and `value`'s declaration itself. The operator picker lists it explicitly. Its one parameter, `value`, accepts any type, and its content is quoted. In shorthand, `{ $literal: X }` is never read as named or positional: the payload is the content.

**Modifier rows.** The reserved keys on a node, `//`, `vars`, `fallback` and `noCache`, are not parameters, and they form one family of child rows with their own treatment (designed in topics 3 and 5):

- `//` is a comment, formatted as a note belonging to its node. Its value is a string or an array of strings. The fill-in step places it first among the node's keys, so it renders at the top.
- `vars` is a block of names to expressions, with a header.
- `fallback` is an expression slot.
- `noCache` is the literal `true`, on an operator node or a fragment call, and turns caching off for the node and everything inside it (fig-tree 3.0.0-preview.4, [fig-tree-evaluator#204](https://github.com/CarlosNZ/fig-tree-evaluator/issues/204)).

**Quoted subtrees are plain data.** Everything inside a `literal` payload or a `//` value renders as plain data: no node headers, no Evaluate affordances on reference-shaped strings, no conversions. So plain data has two sources: values that are not expressions, and values that are quoted.

**`{ $typo: … }` is plain data with an error,** matching the grammar: an unrecognised `$` key is an `unrecognized-identifier` error, so `evaluate()` refuses the expression, and data with a `$` key goes inside `literal` (fig-tree 3.0.0-preview.8). Only a recognised `$name` key makes a shorthand node.

### Classification — **Agreed**

**Kind depends on position, not only on value.** `vars: { operator: 'x' }` declares a var named `operator` rather than being an operator node; anything inside a `literal` or a `//` value is data whatever it looks like; and a `match` literal-branches map has classification edges of its own. A json-edit-react `condition` sees one node's value and path, so asking these questions per node means walking ancestors for every node on every render.

**So the editor classifies the whole tree once per update**, walking it as the compiler does and carrying the context (inside a `literal`, a comment or a `vars` block), and produces a map from path to kind. Each `condition` predicate is then a lookup in that map. The walk also runs once rather than once per node.

**The editor owns the walk; fig-tree supplies the per-object reading.** The compiler's own functions classify each object and string, so the editor never re-implements the grammar: `classifyObject` (`src/compile/grammar.ts`), `recognizeReference` (`src/compile/references.ts`) and `positionalLayout` (`src/compile/grammar.ts`, which maps a positional payload to parameters for the type filter). `./format` exports them from fig-tree 3.0.0-preview.2 (F1 in [v3-upstream.md](v3-upstream.md)). The walk around them, with its position rules, is the editor's: `literal` content and `//` values are not walked, a `vars` block is a map of names, a fragment call's `parameters` is a map or a node, `fallback` is an expression, and an iterator's `as` name is a reference namespace only inside its `each`. `./format`'s `Walk` (`src/format/walk.ts`) is the template, and its spec's "What the walk visits" table lists the rules.

- **Context flows down, never up.** The walk is top-down, as the compiler's and `./format`'s are, carrying a small context from each row to its children: quoted or not, inside a `vars` block or a `parameters` map, and the `as` names in scope. A row never needs its whole ancestor tree, only that context, and never needs its descendants beyond its own value one level down: a node decides its `$name` row's role (flattened or unlabelled) from that row's value, and a fragment call decides static or dynamic from its `parameters` value.
- **The walk records each node's scope chain,** the paths of the `vars` blocks and iterators enclosing it, so sub-tree evaluation can build its wrappers from that record rather than walking the ancestors again, and the type dropdown offers Variable and Element only where they are in scope (topic 4).
- **Broken nodes come from `validate()`,** which the editor runs on every render. `classifyObject` reports only the grammar-level malformations; the rest (an unknown operator or fragment, the wrong number of arguments, an illegal sibling key, a fragment payload that is not an object) are issues at the node's path. The walk classifies; it does not re-validate.
- **A parity test guards against drift.** The editor's test suite compares its classification with the compiler's, using `inspect()` as the oracle: every node and reference the compiler finds, at the same paths. `inspect()`'s report shape is outside semver, which is acceptable in a test pinned to the fig-tree version the editor depends on.
- **Rejected: a tree-level classifier in `./format`.** It would keep the position rules beside the compiler, but it is editor-shaped API for fig-tree to keep stable, and `./format`'s walk would need a non-throwing mode, path access and `as`-scope tracking it does not otherwise need.

### Anchoring — **Agreed**

Every node kind is anchored on its own object (or, for a bare reference, its string), so the custom node's `value` is the whole node and its `path` is the node's path. Converting between forms then replaces the value at the same path, so the node stays where it is and "To full" is `setValue(toCanonical(value, fig))` from the node's own component (topic 2, "Commit semantics").

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

| Shape                                                                                   | Rows → definition                                        | Renders                                                                                                                 | Behaviour                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ operator: 'plus', values: [1, 2] }`                                                  | object → Node (Operator); `operator` → Filtered          | Header: Evaluate button showing the name as written, display name linked to `docUrl`, description tooltip, To shorthand | DisplayBar pencil opens the toolbar (operator picker, add parameter, node type switch); edit-tools pencil opens raw JSON; parameter rows get the per-parameter type filter |
| `{ operator: '+', values: [1, 2] }`                                                     | as above                                                 | Button shows `+`                                                                                                        | Switching between `plus` and `+` keeps the node                                                                                                                            |
| `{ '//': 'why', operator: 'http', url: '…', fallback: null, vars: {…}, noCache: true }` | as above; each modifier row → its own definition (below) | Comment first, then parameters and modifiers                                                                            | As above                                                                                                                                                                   |
| `{ operator: 'flibble' }`, `{ operator: 42 }`, `{ operator: 'plus', fragment: 'x' }`    | object → Node (Operator, broken state)                   | Header shows the name (or "invalid node") as an error, with the issue's message                                         | Toolbar available, to pick a valid operator; no Evaluate or conversion, since the compiler and `./format` refuse the node                                                  |

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

| Shape                                                                          | Rows → definition                                                                        | Renders                                                                                                                         | Behaviour                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ $if: { condition: c, then: a, else: b } }`                                  | object → Node (Shorthand); `$if` → Flattened payload                                     | Header: Evaluate button showing `$if` in italics, display name, and its conversion button ("To positional"); parameters beneath | Values editable in place, with the type filter by parameter name; no toolbar                                                                                                                                                                                                                                                                                                 |
| `{ $plus: [1, 2] }`, `{ '$+': [1, 2] }`                                        | object → Node (Shorthand); `$plus` → None (the argument array), unlabelled               | Header, then the array with its brackets and edit tools                                                                         | As above, with the type filter by position through `positionalParams`; the array's ＋ adds an element where the operator has a rest parameter or an unfilled optional trailing position. Showing each element's parameter name, dimmed, would need a component on every element row or a JER option, since JER draws no key slot for array elements while indexes are hidden |
| `{ $not: true }`                                                               | object → Node (Shorthand); `$not` → None, unlabelled                                     | Header, with the value on its line                                                                                              | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $not: '$data.x' }`, `{ $min: '$data.scores' }`                              | object → Node (Shorthand); `$not` → Leaf (reference), unlabelled                         | Header, with the reference on its line                                                                                          | As above; the reference has its own Evaluate                                                                                                                                                                                                                                                                                                                                 |
| `{ $not: { $greaterThan: […] } }`, `{ $and: { $map: … } }`                     | object → Node (Shorthand); `$not` → Node (Shorthand), unlabelled                         | Header, then the inner node's header                                                                                            | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $http: 'https://…', fallback: null }`                                       | object → Node (Shorthand); `$http` → Leaf or None, unlabelled; `fallback` → modifier row | Header, the URL, then the fallback row                                                                                          | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $greet: { name: 'Ada' } }`, `{ $greet: {} }`                                | object → Node (Shorthand, fragment); `$greet` → Flattened payload                        | Header with the fragment's hints (no form toggle: fragments are named only), then the arguments                                 | As above                                                                                                                                                                                                                                                                                                                                                                     |
| `{ $greet: { $buildObject: […] } }`                                            | object → Node (Shorthand, fragment, dynamic); `$greet` → Node, unlabelled                | Header, then the node                                                                                                           | To full gives a canonical dynamic call                                                                                                                                                                                                                                                                                                                                       |
| `{ $plus: [1], extra: 2 }`, `{ $plus: 1, $minus: 2 }`, `{ $greet: '$data.x' }` | object → Node (Shorthand, broken state)                                                  | Header shows the error                                                                                                          | No Evaluate or conversion (`./format` throws); fixed through raw JSON                                                                                                                                                                                                                                                                                                        |

#### `literal`

| Shape                                             | Rows → definition                                                                                                                                                               | Renders                                                                                 | Behaviour                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `{ operator: 'literal', value: { $plus: 1 } }`    | object → Node (Operator's component); `operator` → Filtered; the `value` subtree is quoted, so None throughout                                                                  | Header with `literal`'s display data (topic 1, "Kinds"), then the content as plain data | Toolbar as for an operator (the picker lists `literal`); `value` accepts any type; To shorthand gives `{ $literal: … }` |
| `{ $literal: { $plus: 1 } }`, `{ $literal: 'x' }` | object → Node (Shorthand's component); `$literal` → the content's own row, unlabelled (not flattened, so a collection keeps its brackets and edit tools); the content is quoted | Header (no form toggle), then the content as plain data                                 | To full gives the canonical form                                                                                        |

#### References and other strings

| Shape                                                                   | Rows → definition | Renders                                                       | Behaviour                                                                                |
| ----------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `'$data.user.name'`, `'$d.user.name'`, `'$data'`                        | Leaf (Reference)  | The string in its namespace's colour, with an inline Evaluate | Edits as a string; "To get node" among the hover edit tools                              |
| `'$vars.country[0].name'`, `'$element.name'`, `'$index'`, `'$order.id'` | Leaf (Reference)  | As above                                                      | As above; Evaluate needs the ancestor scope; `$index` has no get form, so no To get node |
| `'$vars.nope'`, `'$element'` outside an iterator                        | Leaf (Reference)  | As above, with its diagnostic                                 | No Evaluate                                                                              |
| `'$dat.x'`, `'$database'`, `'Hi {{$data.name}}'`                        | None              | A plain string (the first two carry a warning)                | —                                                                                        |

#### Plain data and modifier rows

| Shape                                                              | Rows → definition                                             | Renders                                          | Behaviour                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `{ title: '$data.name', total: { $plus: […] } }`, `['$data.a', 1]` | Node (Container)                                              | A bare Evaluate button above the rows            | Evaluate only, at the root only (topic 3)                           |
| `{ a: 1 }`, `{ $typo: 1 }`                                         | None                                                          | Plain json-edit-react (`$typo` carries an error) | —                                                                   |
| `'//': 'note'`                                                     | Leaf (Comment line), with `showKey: false`                    | A note belonging to its node                     | Edits as a string                                                   |
| `'//': ['line 1', 'line 2']`                                       | a plain array with `showKey: false`; each line a Comment line | A multi-line note, styled as one block           | Each line edits as a string; ＋ adds a line (topic 5)               |
| `vars: { country: {…}, n: 5 }`                                     | None, with theme styling on the block (topic 5)               | A tinted block; each row's key is a var name     | Values classified as usual; names follow the name-legality rule     |
| `fallback: …`, `noCache: true`                                     | None, with a modifier style on the key                        | The row, marked as a modifier                    | `fallback`'s value is classified as usual; `noCache` is `true` only |
| Inside a `literal` payload or a `//` value                         | None throughout                                               | Plain data                                       | No Evaluate, conversion or reference styling                        |

### Conversions — **Agreed**

- **One conversion button steps through the forms** (topic 3): a full node's button reads "To shorthand" and gives the named form; a named shorthand's reads "To positional"; a positional shorthand's reads "To full". A node with no positional form (a fragment call, `literal`, an operator without `positionalParams`) swaps between full and named.
- **"To shorthand" and "To full" convert the node and its whole subtree,** as `./format`'s `toShorthand` (with `arguments: 'named'`) and `toCanonical` do.
- **"To positional" also converts the whole subtree,** as `./format`'s `toShorthand` with `arguments: 'positional'` does, so every conversion is subtree-wide and needs nothing new upstream. A node-only conversion was considered, which would need a single-level option in `./format` (F2 in [v3-upstream.md](v3-upstream.md), dropped); it may be revisited once the editor is in use.
- **A bare reference can be turned into a `get` node** (`toGet`), so the author can add `default` or `from`. A `get` node can be turned back into a reference (`toReference`) wherever that returns a value; `null` means the affordance is not offered.
- Conversions are not offered inside quoted subtrees.

### Sub-tree evaluation — **Agreed** (direction; the mechanics are in topic 7, "Sub-tree evaluation")

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
- **Narrowing the routes where it is cheap** is for later topics: the operator picker moving operators whose `returns` does not fit the parameter to a group that cannot be chosen (topic 4), and array add and delete respecting constraints (topics 4 and 7).

### The fill-in step — **Agreed**, except where marked

The editor's step that changes the tree, run over the whole expression after every update and when the host passes an expression in. It is not called "validate" (plan, 4.5).

- **Complete: insert missing required parameters with their starting values** (the seed rule from `./editor-hints`), on load and after every update. For a fragment call with static arguments, the same applies to its required arguments, with the fragment's `FragmentHints` seeds. It is form-aware: a named payload gains a key, and a positional payload gains trailing elements, since supplied positional arguments are always an unbroken prefix. It cannot apply to dynamic arguments.
- **Clean: remove parameters that do not belong only when the editor switches a node's operator, fragment or node type, or creates a node,** and only on that node. Never on load, on a content edit, or on the other structural actions: adding a parameter or converting makes nothing obsolete, so cleaning there would remove keys the author wrote, such as a typo the "Rename" quick fix should repair.
- **Put keys in order:** `//` first, then the node's parameters (`positionalParams` first, then declared order, topic 4), then `fallback` and `noCache`, then `vars` last (topics 1 and 3).
- **Unknown keys stay,** with the error state and quick fixes: remove the key, or rename it where fig-tree suggests a name (`Issue.suggestion`, F3 in [v3-upstream.md](v3-upstream.md)).

**Structural actions — Agreed.** The actions where the editor itself rewrites a node's identity: creating a node from the type dropdown, switching operator, fragment or node type, adding a parameter from the picker, and the conversions. Everything else is a content edit: value edits, json-edit-react's add and delete, drag and drop, the host's input, and raw-JSON submits. A raw-JSON submit is content because the author has typed exactly what they want, and it is the escape hatch for what the structured path cannot express: changing `operator: 'plus'` to `'if'` in the textarea removes nothing, and the leftover parameters show as unknown-key errors. The rule: **the editor only removes what the editor itself made obsolete.**

**The typo guard — Agreed.** A missing required parameter is not inserted when the node has an unknown key whose `unknown-node-key` issue suggests it (`thn` for `then`, in `Issue.suggestion`, F3 in [v3-upstream.md](v3-upstream.md)). fig-tree reports both errors, but they are one mistake, so the editor shows only the typo's: the `missing-required` the guard holds back is left out of the tree's marks, the cards, every count and the messages area (`withoutHeldBack`), and the quick fix "Rename `thn` to `then`" clears both, rather than a seed appearing beside the typo (Carl). Rejected: counting the pair as one but showing both, which still marks the node and the row for one mistake. The editor carries no did-you-mean matcher of its own, so where fig-tree suggests nothing there is no guard, and an unknown key's only quick fix is "Remove".

**Where cleaning runs — Agreed** (Phase 5). Cleaning is a step of its own, apart from completing and ordering. The component making a structural action cleans its node, that node's own keys only, and commits the result with `setValue`. The fill in `setData` then completes and orders it as it does every edit. So the host's `onUpdate` sees the node cleaned but not yet completed, as it sees every edit before the fill, and `setExpression` gets the finished node. Because the fill's `validate()` runs after cleaning has removed the unknown key, the typo guard never holds back a parameter whose misspelling cleaning has already removed. The plan (5.3) records the alternatives rejected.

**Marking what was filled in on load — Agreed.** The editor remembers which paths it completed when an expression was loaded, as UI state outside the data, and marks those rows briefly (the marker fades, topic 7), with a line for each in the messages area until its row is edited or the line dismissed. The seed value itself is not annotated: most seeds are not strings, and an annotated string would be saved as real data if nobody noticed it.

### Reporting state to the host — **Agreed** in topic 8 ("Telling the host about state"; the handle in "The handle and edit sessions")

The host needs the editor's state, for example to disable its own Save button while the expression is invalid.

- **`onStatusChange`,** with the editor's counts, whether an edit is open, and the messages it lists (topic 8, "Telling the host about state").
- **The imperative handle,** json-edit-react's `editorRef` extended, so a host can `confirm()` or `cancel()` an open edit before saving (topic 8, "The handle and edit sessions").
- The editor passes every expression to `setExpression`, invalid ones included. Whether an invalid expression may be saved is the host's decision.

### Node lifecycle — **Agreed**

**Creating a node.** A value row's type dropdown is the entry point, as in v1: it offers "Operator", and "Fragment" when fragments are registered. The new node starts with its required parameters seeded (a fragment's required arguments go in a static `parameters` map), and its picker opens straight away, so the starting operator is only momentary. The starting operator is host-configurable, as in v1. Where the row is a parameter, operators whose declared `returns` fits it are preferred, the detail being topic 4's. A reference needs no action: typing `$data.x` into a string makes it one. json-edit-react has no type dropdown on collection rows, so a plain object or array becomes a node by way of a value or raw JSON, as in v1. v1's `justSwitchedTo` opens the picker; json-edit-react's `editOnTypeSwitch` could replace it, but renders the component in a value row, with no child rows, so it is not pursued unless that proves worthwhile.

**Switching operator** (full form, from the toolbar's picker) is a structural action, so it cleans:

- The modifiers are kept: `//`, `vars`, `fallback` and `noCache`.
- Parameters whose name the new operator also declares are kept, even where the kept value no longer type-checks against the new declaration: the error shows straight away, and the author's work is not lost. So `plus` to `multiply` keeps `values`, and `map` to `filter` keeps `input`, `each` and `as`.
- The other parameters are dropped, and the new operator's missing required parameters are seeded.
- There is no confirmation step, even when the switch drops a subtree.
- **Switching to `literal` quotes the node** instead: the node as it stands becomes the literal's content (topic 5, "`literal`").

The same rule repairs a broken node: picking `plus` for `{ operator: 'plsu', values: [1, 2] }` keeps `values`.

**Switching node type** (Operator, Fragment or Value, from the toolbar):

- Operator to Fragment gives the default fragment with its required arguments seeded, keeping the modifiers, `//`, `vars`, `fallback` and `noCache`, which fragment calls take too.
- Fragment to Operator gives the default operator, seeded, keeping the same modifiers.
- Either to Value replaces the node with the starting value for its position: the parameter's seed where it is a parameter, otherwise the seed for its declared type, and the string seed anywhere else.
- After a switch the new node's picker opens, as in v1.

**Name or alias — Agreed.** The picker has one entry per operator, titled with editor-hints' display name, which already carries the alias ("Plus (+)"), so there is no separate alias badge. Search matches either spelling. It opens with the current operator selected. The spelling is switched with a modifier-click on the DisplayBar's button (revised in plan 7.5, below):

- **A new operator node** gets the canonical name, or the spelling written in the host's `defaultOperators` (topic 8, "Defaults and what the pickers offer"), which then carries through switches by the rule below.
- **Switching to another operator keeps the node's current spelling where the new operator allows it:** `+` to `*`, and `+` to `?` for `if`. An operator with no alias gets its canonical name, and the node's spelling is then canonical: `+` to `match` to `multiply` ends as `multiply`.
- **A modifier-click on the DisplayBar's button writes the other spelling** (`plus` to `+` and back), with json-edit-react's clipboard modifier (Cmd or Ctrl by default, or the host's `keyboardControls.clipboardModifier`), as a modifier-click on json-edit-react's Copy copies the path. It works with the toolbar closed, so the button shows the change at once. The operator's hover card says so ("Cmd/Ctrl-click to write it as `+`"). For an operator with no alias, or where the node can't be edited, it does nothing. Selecting the current operator again in the picker changes nothing.

**Revised in plan 7.5 (Carl):** selecting the current operator again toggled its spelling, with a hint on the current entry ("select again to write as `+`"). Neither was intuitive, and the change had no visible effect, since the DisplayBar is hidden while the toolbar is open. Then tried and dropped: a `plus | +` toggle in the toolbar, too big for something rarely switched. Considered and not taken: a double-click on the button, since a double-click fires two clicks first, so Evaluate on a single click (Phase 10) would either wait on every click to rule out a second, or run twice. The modifier-click is hidden, but it follows an established json-edit-react pattern, and spelling isn't important enough to need a visible control.

### Two editors per node — **Agreed**

Each full node (operator, fragment call and `literal`) can be edited two ways: through the structured toolbar, opened by the DisplayBar's pencil, or as raw JSON, opened by the ✎ in json-edit-react's edit tools. Shorthand nodes and plain containers have no toolbar, so their only editor is json-edit-react's raw JSON.

**One definition per full node, whose component owns both editors.** The definition has `showOnEdit: true`, so its component renders every edit session on its row, whichever button opened it. The component keeps the requested editor in local state: the DisplayBar's pencil sets it to the toolbar before opening the session, json-edit-react's ✎ opens the session without setting it, so the component shows raw JSON, and the state resets when the session ends for good: on ✓, ✗, a displacement, or the handle's `confirm()` or `cancel()`, not on the commit-and-reopen that each toolbar action makes ("Commit semantics"). The raw-JSON editor is json-edit-react's own, composed into the component, the collection counterpart of composing `StringEdit` into a value component. With `passOriginalNode: true`, json-edit-react passes it as `originalNode` while editing, bound to the row's own edit buffer, with its own ✓ and ✗ (J2 in [v3-upstream.md](v3-upstream.md), shipped in json-edit-react 2.0.1).

**Rejected: v1's variant pair.** v1 gives each node two definitions, a toolbar variant (`showOnEdit: true`, matching only while `displayBarEditPath` names the node) and a default variant (`showOnEdit: false`, so json-edit-react's textarea shows), with `useCommon` setting and clearing the path. It works, but a row's definition is chosen by its parent and json-edit-react's memo ignores a change of definition, so switching variants means passing a new `customNodeDefinitions` array, which re-renders every row, twice per toolbar use. Local state in the component re-renders that node only.

**Rejected: editor modes on json-edit-react's edit session**, so that a definition could show its own editor only in sessions opened in a "custom" mode. It would remove the same bookkeeping, but it is more public API than composition needs, and composition already serves value rows through `StringEdit`.

**Each editor has one way in:** the DisplayBar's pencil opens the toolbar, and json-edit-react's ✎ opens raw JSON. There is no switch between them inside a session: the toolbar's "Edit as JSON" and the raw-JSON editor's "Use the toolbar" were mocked up (topic 3) and dropped, since each only saves closing the session and reopening it from the other control.

While a session is open, json-edit-react hides the row's edit tools, as in v1. Changing that (J1) was considered and dropped for now, to be revisited once the toolbar can be tried in the built editor.

### Commit semantics — **Agreed**

**Toolbar edits are live, and Cancel reverts.** When the toolbar opens, the component takes a snapshot of its node's value. Each change is committed as it is made, so the child rows beneath always show the current state. ✓ and Enter close the toolbar, keeping the changes, which are already committed; ✗ and Esc commit the snapshot back and close; opening another node's editor keeps the changes, as json-edit-react does when one edit displaces another. The revert is one write to a stable path, because the node is anchored on its own object, and nothing else in the tree can change while the toolbar is open, since editing another row opens a new session and closes this one first. It also covers the risk accepted under "Node lifecycle": a switch that drops parameter subtrees can be cancelled while the toolbar is open.

**Each change is an ordinary json-edit-react commit, as json-edit-react documents for a `showOnEdit` collection with a toolbar** (its README's "Collection nodes" and Playlist example). The component writes its node's new value with `setValue`, which is json-edit-react's commit pipeline: the host's `onUpdate`, then `setData`, where the fill-in step runs, then `setExpression`. Committing closes the node's session, so the component reopens it with `setIsEditing(true)`, and the toolbar stays open until ✓, ✗ or a displacement. The revert on ✗ is one more such commit, of the snapshot. So the toolbar's writes reach the host exactly as any other edit's do, and v1's `buildOnEdit`, which wrote to `setExpression` beside json-edit-react, is replaced by `setValue` at the node's own path (plan, "The patterns"). A host's `onUpdate` can reject a toolbar commit as it can any edit. The change is not applied, and the toolbar stays open, since the component reopens the session straight after `setValue`. json-edit-react fires `updateError` through `onEditEvent`, but shows no error on the row, and `setValue` is typed as returning nothing, although it returns the commit's outcome. So showing the rejection in the toolbar, and keeping the toolbar open after a rejected revert, depends on J10 in [v3-upstream.md](v3-upstream.md), Open.

**How the session runs — Agreed** (Phase 5, read from json-edit-react 2.0.1's `EditingProvider` and `CollectionNode`). `setValue` goes through the store's `submit`, whose `apply()` closes the session, and the component's `setIsEditing(true)` in the same handler opens it again, so the component never renders between the two. That is the reopen. Every other end is final, and the component resets its editor state when `isEditing` turns false:

| End                      | What happens                                                                                                  | Changes  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | -------- |
| ✓, Enter                 | The component calls `handleEdit()`, whose untouched raw-JSON buffer commits as a no-op and closes the session | Kept     |
| ✗, Esc                   | The component commits the snapshot and doesn't reopen                                                         | Reverted |
| Another row opens        | The store calls the session's commit-on-displace, the same no-op commit, then opens the other row             | Kept     |
| The handle's `confirm()` | Clicks `editConfirmRef`, which the toolbar's ✓ holds                                                          | Kept     |
| The handle's `cancel()`  | The store closes the session                                                                                  | Kept     |

A synchronous rejection by the host's `onUpdate` leaves the session open, so the toolbar stays open with the change not applied. A host `onUpdate` that calls `hold()` closes the toolbar after each action, since `open()` does nothing while a commit is held: accepted for now, and recorded on J10.

**Rejected:** live edits with no Cancel, which leaves no way back from an unintended change; and holding the changes until ✓, which would leave json-edit-react rendering the old child rows beneath a switched operator's header until confirmed.

**Undo history.** A host that saves automatically sees each change as it is committed, and the revert, and a host using `@json-edit-react/utils`' `useUndo` records one step per toolbar action, as in v1, and one for Cancel's revert, so Undo straight after a Cancel brings back the cancelled state. Accepted: the history is consistent, since Cancel is itself an edit. Grouping a whole toolbar use into one step was considered (J3 in [v3-upstream.md](v3-upstream.md), dropped): with each action its own session, json-edit-react cannot see where a toolbar use begins and ends, so it would need the editor to report the toolbar's opening and closing to the host, editor-specific API for a small nicety (topic 8, "The handle and edit sessions").

**Completion on load and undo — Agreed** in topic 8 ("The expression and loading"): the editor's write that completes an expression it was given is marked `{ autoUpdate: true }`, so a host using `useUndo` commits it with `replace`, recording no step.

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

- on a full operator node, none: the toolbar's "Add parameter" offers its declared parameters and modifiers, and a second control for the same list only duplicated it (plan, 6.4). So its keys cannot be renamed in the tree either, by json-edit-react's rule below;
- on a full fragment call, the modifiers, and `parameters` if absent; arguments are added through the toolbar, since they belong inside `parameters`;
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

- **The DisplayBar keeps v1's layout:** the Evaluate button showing the name as written, the pencil beside it, the display name at the top right linking to `docUrl`, and the conversion button beneath it.
- **The pencil and the conversion button appear on hover only,** as in v1, keeping the tree uncluttered when it is only being read. The pencil appears while the header is hovered. On a full node, the conversion button appears only while it is hovered itself, so it doesn't compete with the pencil. A shorthand node has no pencil, so its conversion button appears while the header is hovered anywhere but the Evaluate button: someone looking for the pencil finds the way back to the full form instead (Carl). A "To reference" button appears while the header is hovered anywhere, as the pencil does, since a `get` that can be a reference is one the author will usually want shorter (Carl).
- **The toolbar replaces the DisplayBar** while it is open: node type, operator or fragment picker, add parameter, ✓ and ✗. It has no switch to the raw-JSON editor ("Two editors per node").
- **The raw-JSON editor stands alone — Agreed** (Phase 5): json-edit-react's textarea and its ✓ and ✗ in the node's border, with no DisplayBar or label above it (A4's "Editing as JSON" dropped). The operator is in the JSON, so a header above it would show the saved one while another is typed.

### States — **Agreed**

- **Modifier keys look different from parameters** (`fallback`, `noCache`; italic and muted in the mockups, the exact style to be settled later).
- **A broken node** has an error border (A5). **A row an issue points at** is tinted, with a short flag. There is no issue-count badge on the header, and no "unknown operator" badge. Which row an issue marks, which codes make a node broken, and how errors and warnings differ are settled in topic 7 ("Where issues attach").
- **A collapsed node with an issue** colours its summary line as an error.
- **Filled in on load — Agreed** in topic 7: the marker fades after a few seconds, needing no edit to clear. Its line in the messages area stays until its row is edited or the line dismissed, so the record is not lost if the marker is missed.
- **No badge for dynamic fragment arguments:** `parameters` there is a property with a value, and nothing needs to call attention to it.
- **No "quoted data" badge on `literal`:** its neutral colour and plain-data content are enough.

### Kinds — **Agreed**

- **Shorthand nodes have a dashed border** (v1 draws none), which also keeps a nested shorthand node's extent visible (C4). The name on the button is italic, as in v1, for now.
- **A single plain value or reference sits on the button's line** (C3), as in v1, since the point of shorthand is concision. A nested node as the single value still goes beneath (C4).
- **A positional payload keeps its brackets** (C2): the argument array is unlabelled rather than flattened, keeping its chevron and edit tools, since it is still one value beneath the `$name`. A named payload stays flattened (C1).
- **One conversion button cycles the forms:** "To shorthand" on a full node (giving the named form), "To positional" on a named shorthand, "To full" on a positional one; a node with no positional form swaps between full and named ("Conversions", topic 1). Going from named back to full takes two clicks, by way of positional.
- **`literal` keeps its Evaluate button,** for consistency, though it only returns the content.
- **References:** Evaluate is a small ▶ inline after the text, always visible (settled in plan 10.6, over a place among the edit tools, which show on hover only). "To get node" is a json-edit-react custom button on reference rows, a braces icon in the namespace's colour, appearing on hover with the other edit tools and committing through `onUpdate` (J13, plan 8.3). **Each namespace has its own colour:** `$data`, `$vars`, `$params`, and the iterator bindings (`$element`, `$index` and `as` names). The palette: violet for `$data`, teal for `$vars`, magenta for `$params`, and amber-brown for the bindings, each distinct from json-edit-react's string, number, boolean and null colours. **The colours are tokens that a host can swap,** through the `editorTheme` prop (topic 8, "Theming and CSS").
- **Plain containers with holes** get the bare Evaluate button **at the root only,** for now.
- **Comments** render as a note beneath the header, with json-edit-react's edit tools on hover like any row.
- **Row order:** the node's parameters, then `fallback` and `noCache`, then `vars` last. The vars block takes the `$vars` reference colour and is set slightly apart from the rows above it. The fill-in step orders keys to match.
- **Fragment display name:** as on an operator, the button shows the name as written (`getCapital`) and the top right shows the display name from `FragmentHints` ("Capital city · fragment"), so neither repeats the other. The "· fragment" suffix shows where there is room, and is hidden when the editor is narrow. **A fragment with no display name** shows "Fragment" alone at the top right, as in v1, rather than falling back to its name, which the button already shows. Nothing extra is shown while the toolbar is open, although the picker then shows only the display name (topic 6). Rejected: "Fragment | getCapital" in place of the display name, and "Capital city | getCapital", both of which repeat the button.
- **Fragment default colour:** a generic colour for every fragment whose metadata defines none: v1's default for now, to be tweaked later, yellow text (`#ebdf5a`) on dark steel blue (`#477799`), for every fragment whose metadata carries no colours. Every operator button is a light shade of its category's hue, so a dark button stands apart by treatment without borrowing any category's hue. Deriving a colour from the fragment's name (hashing the name to a hue, then making a light background and dark text as editor-hints' palette does) would tell fragments apart, but an arbitrary hue can land on an operator category's colour and suggest a category the fragment does not belong to, and renaming a fragment would change its colour. A host that wants fragments told apart gives them `FragmentHints` colours.

### Collapsed nodes — **Agreed**

As in v1: a collapsed node shows only json-edit-react's header row, with a summary between the brackets in place of the item count (section I of the mockups): `{ Operator: plus }`, `{ Fragment: greet }`, `{ Shorthand: $if }`, `{ Literal }`, `{ 2 vars }`, and the ordinary count for plain containers. A node with an issue colours its summary as an error, and with more than one, adds a count ("3 errors"). No collapsed row has an Evaluate of its own: a collapsed node is opened to evaluate it (Carl, plan 10.6, dropping the ▶ after a collapsed node's summary, which needed a json-edit-react option or a hover-only custom button).

### Messages — **Agreed** in topic 7 ("The messages area"), with the host API in topic 8 ("Telling the host about state")

A messages region built into the component, below the tree as in Phase 2's skeleton: one line per `validate()` issue and per value filled in on load, each with its path (which reveals the row) and any quick fix. The same information goes to the host through `onStatusChange`, and `messagesMaxHeight={0}` hides the built-in region for a host that renders its own (topic 8).

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
  literalOnly: boolean // `as`, `noCache`: no nodes or references
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
| `fallback: X`                                                 | modifier: what its node's own position admits, since it stands in for the node's value                                        |
| `noCache: X`                                                  | modifier: `true`, literal only                                                                                                |
| `vars: { price: X }`                                          | var: `any`. A separate role from `modifier`, since vars are names that make a scope (topic 5)                                 |
| `as: X`                                                       | parameter, structural: `string`, literal only                                                                                 |
| the root                                                      | root: `any`. A host prop for an expected result type would fit here (topic 8, do later)                                       |
| `body: { name: X }`, `{ title: X, total: {…} }`               | data: `any`. Plain data inside an evaluated position is evaluated too (deep evaluation), so it can hold a reference or a node |

Rows with no slot: the `operator` and `fragment` rows (grammar), a shorthand's payload row (the argument list or the named payload, not a value delivered anywhere; an argument list's ＋ works out what a new element binds with `positionalLayout` at length + 1), the `vars` block itself (a map of names), quoted content and `//`. So a row has a slot exactly when it is evaluated.

**`ownerPath` is recorded, not derived,** because how far up the owning node is depends on its form, from one level to four: `P + ['decimals']` and `P + ['$not']` are one up, `P + ['$multiply', 0]` and `P + ['values', 0]` two, `P + ['entries', 0, 'key']` three, and `P + ['$buildObject', 'entries', 0, 'key']` four. The walk knows it as it passes; a consumer starting from a row would have to redo the walk's reasoning. Because nodes are anchored on their own object, `ownerPath` survives a conversion: "To full" on `{ $multiply: [...] }` moves its elements from `P + ['$multiply', 0]` to `P + ['values', 0]`, and their owner stays `P`.

**Slots are worked out in the classification walk,** recorded per path beside each row's kind (topic 1). The walk already visits every row top-down, carrying each node's shape, so resolving positions there costs almost nothing, and every consumer reads one answer. A row's slot can change when an ancestor changes and its own data does not (switching `round` to `upper` changes what `value` admits), so slot content is part of the map compared by content: a change passes a new `customNodeDefinitions` array and every row re-renders. Only structural actions change slots, so this is rare. Consumers that read at the moment of use, such as json-edit-react's `allowTypeSelection` function or a picker as it opens, read the current map from a ref.

- **Rejected: looking a slot up per row on demand,** from the parent's value and the kind map. It needs the classification anyway, repeats the walk's positional logic, and runs on every call.
- **Rejected: each consumer working it out for itself.** Four copies of the rules and four chances to disagree, which is how v1's `getTypeFilter` came to diverge from the evaluator.

**An element of an array parameter admits what the constraints say.** The metadata has no element-type declaration, and nearly every variadic parameter is a plain `array`. So an element admits the union of `constraints.homogeneous` where it is declared (`greaterThan`'s elements admit `['number', 'string']`), `object` where `constraints.elementShape` is (with a slot per field), and `any` otherwise. It admits `null` where the container declares an `elementNullPolicy` or `truthiness`, or where its type is `any`; `buildObject` declares neither, so a null entry is not admitted. This works for host operators unchanged and never goes beyond the metadata. The consequence, accepted: elements of `and`, `or`, `equal`, `firstOf` and `join` admit `any`, so the type filter and the picker's ranking have nothing to act on there.

- **Rejected: an element-type vocabulary upstream.** It would be new engine semantics, checked per element at runtime, and most variadic elements genuinely accept anything, so it would buy little.
- **Rejected: per-operator element tables in the editor.** They bring back the operator-specific knowledge v3 moved into metadata, and cannot cover host operators.
- `plus` declares `homogeneous` on `values` (F5 in [v3-upstream.md](v3-upstream.md)), so its elements admit `number`, `string`, `array` and `object`, and `null` through its `elementNullPolicy`.

**An operator "cannot fit" a slot when its declared `returns` and the slot's `admits` share no value.** That is exactly `validate()`'s `returns-mismatch` check, so choosing such an operator would produce an error straight away, and the test must agree with `validate()` to the letter. Everything else can fit. References are untyped, so they can always fit. A fragment is tested the same way, against the `returns` fig-tree infers for its body and reports on `getFragments()` (F11 in [v3-upstream.md](v3-upstream.md), topic 6). How the picker treats operators that cannot fit (hidden, dimmed or listed last) is the operator picker's question. The test is fig-tree's own `typesIntersect`, exported from `./format` (F6), so the editor keeps no copy of the rules.

- **Deferred to the operator picker: a containment tier.** Telling operators certain to produce an admitted value (`round` at a number slot) from those that only might (`get`, `if`, `match`) matters only if the picker has a "Suggested" section. With the picker grouped by category, the two mostly follow the categories anyway.
- **Rejected: containment alone as the test.** It would count `get`, `if` and `match`, which return `any`, as not fitting at every typed slot, where they are among the commonest choices.

**The slot carries no preferences.** A `prefers` field was considered, for truthiness positions preferring `boolean` and an element of a homogeneous array preferring its siblings' type. It was rejected. Ordering is already served: at a truthiness position `categoryHints` lists Logic & control and Comparison first. Its one real use is seeding a new value, such as ＋ on `{ $min: ['apple', 'pear'] }`, where the plain starting-value rule gives `1` and breaks `homogeneous`; that belongs to the starting-value rules, which read the siblings and the `truthiness` flag when the value is created. And a preference drawn from siblings would change on every content edit of a sibling, re-rendering the whole tree, where a slot otherwise changes only on structural actions.

- **Rejected for now: passing the expected type down through operators such as `if`.** In `{ $round: { value: { $if: [c, X, Y] } } }`, `X` wants a number, but nothing declares that `then` and `else` become `if`'s result; it would need an upstream declaration, and fig-tree's spec lists that inference as maybe-later.

**Descriptions.** A row's hover card carries its declaration's `description` ("Parameter metadata"). Every core and I/O parameter has one, which fig-tree's drift tests require (F7). A host operator's parameter without one gets no description line.

### The type dropdown — **Agreed**

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
- **Choosing one keeps the input open for the path,** through json-edit-react's `editOnTypeSwitch`, which needs the definition to render json-edit-react's own string input while editing (`showOnEdit: true` with `passOriginalNode`). Proved in Phase 8 (plan, 8.2), where the input also opens with the path selected, the part after the namespace, so typing replaces the path and keeps the namespace.
- **Choosing `string` on a reference row keeps the text,** which is still reference-shaped, so the row stays a reference until its text is edited. Accepted: a string's meaning is what it says.
- Suggesting names while a reference is typed: do later ("Editing references", topic 5).
- **Rejected: offering `string` wherever a reference is possible.** At a number slot it presents literal strings as legal when `validate()` rejects them, and a reference row would show "string" as its type.
- **Rejected: references only where `string` is admitted,** and through raw JSON elsewhere. It blocks the commonest dynamic value at typed slots.

**Operator and Fragment are offered at every slot that is not literal-only,** Fragment only while at least one registered fragment can fit the slot (topic 6). Operator is not hidden where nothing could fit: every operator declares a `returns`, so some operator nearly always can, and ranking is the operator picker's. A host may register only a few fragments, and none of them may fit, so choosing Fragment there would create a call that is an error from the start. `literal` has no entry of its own; it is reached through Operator and the picker, which lists it (topic 1).

**A new node starts as the default operator for its slot's type,** with its required parameters seeded, so the expression is legal from the start and the picker then opens on it (topic 2). "Operator"'s `defaultValue` is a function of the row, so it can do this. The built-in map, merged under the host's `defaultOperators` (topic 8), maps each type to an operator name, seeded by the starting-value rule, or to a whole starting node:

| Slot type           | Default       |
| ------------------- | ------------- |
| `any`               | `plus`        |
| `number`, `integer` | `plus`        |
| `string`            | `buildString` |
| `boolean`           | `equal`       |
| `array`             | `map`         |
| `object`            | `buildObject` |

A slot finds its default by its type: an `any` slot the `any` entry; a basic type its own entry, `integer` falling back to `number`; a union its first non-null member with an entry, in declared order; a literal union of strings the `string` entry. If the operator found is not registered, or cannot fit the slot ("Slots"), the `any` entry is used, and if that cannot fit either, the first operator in category order that can. So a host's map can never create a node that is at once an error. A new node gets the canonical name (topic 2). A new fragment call starts as the host's `defaultFragment` (topic 8; v1's `defaultNewFragment`), where it is registered and can fit the slot, and otherwise as the first fragment in the picker's order that can (topic 6). The built-in choices are open to change once the editor can be tried.

**The row's current type is always listed,** last, when its slot does not admit it (a string at `round.value`, loaded from outside). Otherwise json-edit-react shows a select whose value is not among its options. The row's error state already says the value is wrong, and keeping it stays possible.

**Examples:**

| Slot                                              | admits                           | Options                                                                        |
| ------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| `if.condition`, a var, plain data                 | `any`                            | string · number · boolean · null · object · array · Data · Operator · Fragment |
| `round.value`                                     | `['number', 'null']`             | number · null · Data · Operator · Fragment                                     |
| `round.decimals` (optional)                       | `integer`                        | number · Data · Operator · Fragment                                            |
| `regex.mode` (optional)                           | `'test' \| 'extract' \| 'match'` | Option · Data · Operator · Fragment                                            |
| a `greaterThan` element                           | `['number', 'string', 'null']`   | number · string · null · Data · Operator · Fragment                            |
| a `buildObject` entry                             | `object`                         | object · Data · Operator · Fragment                                            |
| `map.each`, where the node sits in a `vars` scope | `any`                            | the six standard types · Data · Variable · Element · Operator · Fragment       |
| `map.as`                                          | `string`, literal only           | string                                                                         |
| `noCache`                                         | `true`, literal only             | boolean                                                                        |
| quoted content                                    | no slot                          | string · number · boolean · null · object · array                              |

**Collection rows: raw JSON — Agreed.** A parameter holding an array or object (`values: [1, 2]`, `entries`, `body`) has no type dropdown, so turning it into a reference or a node goes through raw JSON, as in v1. A type selector for collection rows is logged as J6 in [v3-upstream.md](v3-upstream.md), Maybe, to revisit once the editor is in use.

### The operator picker — **Agreed**

The searchable list opened from a full node's toolbar (A3 and section J in the mockups). Topic 2 fixed its behaviour: one entry per operator, re-selecting the current entry toggles its spelling, and switching keeps the parameters the new operator also declares. "Slots" supplies the test for operators that cannot fit, and "The type dropdown" the operator a new node starts as.

**Groups and order.** One group per category, in `categoryHints` order, headed by the category's display name; empty groups are hidden (I/O on an instance without I/O operators). Within a group, operators keep `getOperators()` order: fig-tree's canonical order for the core operators, and host operators wherever the host's `operators` array puts them (a host that passes `operators` includes `coreOperators` itself, so it controls the order). `literal`, which the editor supplies, goes in Data & objects, since it produces data verbatim.

- **Rejected: alphabetical by display name,** which breaks the canonical sequences (`and`, `or`, `not`, `if`; `plus`, `subtract`, `multiply`, `divide`) and scatters related operators.
- **Rejected: core operators first, then host operators,** which goes against the first-class principle (topic 1) when the host already controls the order.

**Host operators** have no marking and no group of their own; `category` is required on every definition, so they sit where authors look. Display data is layered, lowest first: `./editor-hints`' `operatorHints` (`literal` included), the definition's `metadata` read as `OperatorHints`, then the host's `operatorHints` prop (topic 8, "Display overrides"). A host operator with no display name shows its canonical name, and one with no colours takes a light shade of its category's colour (topic 8).

**Search** matches the display name, which carries the alias ("Plus (+)"), the canonical name, and the category name (typing "math" shows the whole group, as `Select` does with group labels). It does not match descriptions: "number" appears in most math descriptions, so they would bury the entry being looked for. Groups stay while searching, with empty ones hidden. After each keystroke the first match in list order that can be chosen is highlighted, so a symbol or name then Enter picks it; the list order already puts the likely operator first (`>` gives Greater than, `=` gives Equal).

- **Do later: a ranked best match,** exact name, alias or display name first, then a prefix of any of them or of a word in the display name, then a substring, ties in list order. It needs a scoring hook in `Select`.
- **Rejected: flattening results into one ranked list while searching,** which moves entries between two layouts as the author types.

**Operators that cannot fit the node's own slot** (their declared `returns` shares no value with what the slot admits, so `validate()` would report `returns-mismatch` at once) move to a final "Not valid here" group, cannot be chosen, and show their reason in place of the description ("Returns a string; this position takes a number or null"). Search still finds them. At an `any` slot nothing moves. The current operator stays in its own group and can be chosen even if it cannot fit (a loaded expression, or a parent that changed), so re-selecting it still toggles its spelling; its error comes from `validate()`. At `round.value` (`['number', 'null']`) with the core operators, 20 of 40 move, and Comparison disappears as a group (mockup J1).

- **Rejected: hiding them,** which leaves an author searching for "lower" at a number slot with no result and no reason.
- **Rejected: listing them last but choosable,** which breaks topic 2's rule that the structured path always leaves a node valid.
- **Rejected for now: a "Suggested" section** of operators certain to produce an admitted value ("Slots" left it to this question). At typed slots those mostly fill one category anyway (Arithmetic at a number slot), and the section would list each of them twice. Easy to add later.
- **Sharing only `null` counts as fitting — Agreed.** Any operator that can return `null` can fit any slot that admits `null`, so `regex`, whose `returns` includes `null` from `noMatchDefault`, stays under Strings at `round.value`. The picker stops only what `validate()` would reject: a stricter picker would refuse something the author can still write in raw JSON with no error, and the choice can be deliberate (`regex` in `extract` mode gives `null` on no match, which `round` propagates).

**Where it opens.** On a new node, with the slot's default operator selected and the search field focused (topic 2), so typing filters at once. On a broken node (`{ operator: 'plsu' }`), with no current entry, and with the operator its `unknown-operator` issue suggests highlighted (`Issue.suggestion`, F3 in [v3-upstream.md](v3-upstream.md)), so the pencil then Enter repairs it, keeping `values` under topic 2's switch rule. A suggestion may be an alias (`'+'`), which highlights that operator's one entry. Where fig-tree suggests nothing, nothing is highlighted and the author searches.

**Each entry** shows the display name and the description. The current entry carries the spelling-toggle hint as part of its label text ("Multiply (*) ⇄ select again to write as *"), which needs no change to `Select`.

**Changes to `Select` for the first build — Agreed.** The smallest set that makes the picker work. `Select` is exported, and the second change is breaking for it, which v3 as a major release allows:

1. **`disabled?: boolean` on options.** A disabled option cannot be clicked, is skipped by the arrow keys and Enter, and is styled as unavailable (`ft-select-disabled`); it is still shown and found by search. The picker uses it for "Not valid here", with the reason in `description`.
2. **Group headers are labels only,** never clicked or reached by keyboard, and **every selectable option has one index in display order,** which highlighting, Enter and scroll-into-view all use. Today a header can be clicked (`handleSelect(group)`), each option compares the highlighted index with its index inside its own group, so ↓ highlights the same position in every group, a header highlights when the index equals its group's, Enter picks from the flattened list, which may not be the option that looks highlighted, and scroll-into-view finds an element by the per-group index. v1 used groups the other way round, each operator a selectable group with its aliases as options (`getOperatorOptions` in `v1-src/Operator.tsx`); the v3 editor has one entry per operator, so for the migration note, that use is not supported.
3. **The first selectable match is highlighted after each keystroke,** so typing then Enter picks it, where today the highlight resets and Enter does nothing until ↓. Nothing is highlighted when the list opens, as now, so opening the operator picker and pressing Enter does not re-select the current operator, which would toggle its spelling (topic 2). An optional `highlighted` value opens a broken node's picker on fig-tree's suggestion (F3).
4. **`keywords?: string` on options:** text that search matches but that is not shown, to hold the canonical name (`greaterThan` for "Greater than (>)") or a fragment's name. Without it, typing `if`, `greaterThan` or `buildString` finds nothing, since only the display label is matched. An option matches when the typed text, lowercased, is a substring of its label, its `keywords` or its group's label (so "math" shows the whole group): `greatert` finds Greater than through its keywords, `compar` through its group, and `gt` finds nothing. One string, since every case needs one term; named apart from `Select`'s own `search` prop.

Each change has a case in `Select`'s test suite (plan, 1.7).

**Do later: other changes to `Select`.** Category colour swatches on group headers, the canonical name as a second label (A3's monospace column), the ranked best match above, and descriptions cut to one line with the full text on hover.

**Hiding operators from the picker** without unregistering them, for a host that keeps an operator evaluable but does not offer it to authors: do later (topic 8, "Defaults and what the pickers offer").

### Adding parameters and starting values — **Agreed**

**"Parameter", not "property".** The editor's word for an operator's or fragment's declared inputs is fig-tree v3's: the declarations, `getOperators()`, the specs and `validate()`'s messages ("'thn' is not a parameter of 'if'") all say "parameter". v1 said "property", which is JSON's word for any key, `fallback` and `vars` included. The toolbar control is labelled "Add parameter", and lists the modifiers in a second group. A fragment call's argument map is also called `parameters`, and its entries are the fragment's declared parameters, so the label holds on both kinds of node.

**What "Add parameter" offers:**

| Node                  | Offers                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Full operator         | its declared parameters not yet present, then the modifiers not yet present: `//`, `fallback`, `noCache` (below), `vars` |
| Static fragment call  | its declared parameters not yet present, written into `parameters` (created if absent), then the modifiers               |
| Dynamic fragment call | the modifiers only, since its arguments are computed                                                                     |
| `literal`             | `//` only: `fallback`, `vars` and `noCache` are legal there, but `validate()` warns that each is dead                    |

- **`noCache` is offered only where it would do something,** as `validate()` judges it with its dead and redundant warnings: something at or beneath the node caches, which is a caching operator the host hasn't turned off (`cache`, `hostNoCache`) or a call to a fragment whose body caches (`getFragments()`' `caches`), and no node above it has `noCache` already. A node the editor can't read, malformed or naming nothing registered, may cache, as fig-tree has it. So an expression with no requests is never offered it.
- **A missing required parameter is listed first, marked required.** Fill-in normally adds it, but it can be missing where the typo guard held it back (`thn` beside a missing `then`) or a raw-JSON edit removed it.
- **Two groups, Parameters and Modifiers,** with headers that cannot be selected ("The operator picker").
- **Each entry is labelled with its key exactly as it will appear in the tree** (`nullValueDefault`, `fallback`), with its description beneath: the declaration's for a parameter, and the editor's own for a modifier (`fallback`: "The value to use if this node fails"; `noCache`: "Don't cache this node or anything inside it"; `vars`: "Named values for this node and everything inside it"; `//`: "A note, never evaluated"). How required, defaults and the rest are shown is "Parameter metadata", below.
- **json-edit-react's ＋ offers the same list by name** (`newKeyOptions` takes names only) on the nodes whose toolbar has no "Add parameter" yet, or that have no toolbar: shorthand nodes, and until Phases 7 and 9 fragment calls and `literal`. A full operator node has no ＋ (plan, 6.4).
- **Nothing is left out for being unwise.** `body` is offered beside `method: 'get'`, and `validate()` reports the conflict.

**The starting-value rule.** One function gives the value of everything the editor creates: a parameter added from the picker or ＋, a required parameter fill-in completes, an element added with ＋, a row switched to Value (topic 2), and the parameters of a new node's default operator ("The type dropdown"). For a declared parameter of an operator or fragment, it is `./editor-hints`' rule:

1. **Its seed**, from the layered display data ("The operator picker"): `operatorHints` for core operators, the definition's `metadata` for host operators, `FragmentHints` for fragments, then the host's `operatorHints` (topic 8).
2. **Otherwise a value for its declared type:** a literal union's first member; for a union, the type seed of its first non-null member; otherwise the type's `typeSeeds` entry.

The runtime `default` is deliberately not a step, because a parameter is usually added to change it. For the same reason, **a boolean or literal union never starts at its effective default** (`hostDefault ?? default`): where the rule gives exactly that value, a boolean starts as its negation and a literal union at its first member that is not the default. With the core metadata this changes `regex.mode` (`'test'` to `'extract'`), `http.method` (`'get'` to `'post'`) and `sql.shape` (`'rows'` to `'firstRow'`), and any parameter whose `hostDefault` equals its starting value. The result is still a legal value, so fig-tree's drift tests hold, and the rule is documented on `OperatorHints.seeds` as the editor's to implement.

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

**The modifiers** start as: `//`, `'Comment...'` (never evaluated, so an unedited note is harmless); `fallback`, `null`, the common "degrade to null"; `noCache`, `true`, the only value it takes; `vars`, `{}`, whose ＋ then asks for a name.

**An element added to an array — Agreed.** Editor-hints' seeds are for whole parameters, so a new element needs its own rule. The first that applies:

1. **In a homogeneous array, the type seed of the type its literal siblings share,** so an add never breaks the constraint. Skipped where no sibling is a literal (all references or nodes), or where they share no type.
2. **An element of the parameter's seed:** the seed's element at the new index, otherwise its last, so every add beyond the seed's length gives its last element again. Rejected: cycling through the seed, which makes the value depend on how many elements there happen to be.
3. **The type rule for what the element admits,** an `elementShape` giving an object with each required field started by the same rule (`{ key: 'Replace me', value: 'Replace me' }`).

With fig-tree 3.0.0-preview.2's seeds:

| ＋ on                                        | Rule                   | New element                                                |
| -------------------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `{ $min: ['apple', 'pear'] }` (homogeneous)  | 1                      | `'Replace me'`, the string seed                            |
| `{ $multiply: [5, 5] }` (homogeneous number) | 1                      | `1`, the number seed                                       |
| `{ $min: ['$data.a', '$data.b'] }`           | 2, no literal siblings | `2`, the seed `[3, 1, 2]` at index 2; `2` again after that |
| `{ $and: [a, b] }`                           | 2                      | `true`, the seed `[true, true]`'s last                     |
| `{ $or: [a, b] }`                            | 2                      | `false`, the seed `[true, false]`'s last                   |
| `{ $plus: [1, 2] }` (homogeneous)            | 1                      | `1`, the number seed                                       |
| `join.values: ['a', 'b']`                    | 2                      | `'Charlie'`                                                |
| `firstOf.values: [x, y]`                     | 2                      | `'The first non-null value'`                               |
| `buildObject.entries` with two entries       | 2                      | `{ key: 'secondKey', value: 'secondValue' }`               |
| a plain array in an evaluated position       | 3                      | `'Replace me'`, since it admits `any`                      |

A third `buildObject` entry repeats `secondKey` if the author kept it; at runtime the later entry wins, and the trace records the overwrite. Accepted, since the author renames it at once, and rule 3 would repeat `'Replace me'` just the same.

A positional element added with ＋ starts as the parameter it would bind would ("Slots"): an element of the rest parameter by this rule, a leading position by that parameter's own seed (`then`'s, as the second element of `$if`). A declared fixed length blocks the add first ("Array constraints"). Rejected: a special case making truthiness positions start as `true`, which this rule makes unnecessary: the core truthiness parameters all have seeds, and a host operator that wants something better than `'Replace me'` gives its own.

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
| Default     | `default`, `hostDefault`                         | "Default: 0"; with a host override, "Default here: 2 (set by this application; FigTree's is 0)"; `get.from`'s sentinel as "the evaluation data"                                                                                                                                                                                                                                                 |
| Evaluated   | `evaluation`, when not eager                     | lazy: "only when needed"; per element: "once for each element of `input`, with `$element` and `$index` available" (the `as` names where set); race: "all at once; stops as soon as the answer is known"; lazy elements: "each only when needed, in order"; lazy entries: "only the matching entry"; structural: "a name, not an expression, so it can't be computed"                            |
| If null     | the type, `nullPolicy`, `required`, `truthiness` | propagate: "the result is null"; truthiness: "counts as false"; a required parameter whose type excludes `null`: "an error"; an optional one: "means 'not set', so the default applies"; element policies: "a null element makes the result null" or "null elements are accepted"; `convert.value`'s conditional policy: "if `to` is 'boolean', null gives false; otherwise the result is null" |
| Replacement | `replacesNullAt`                                 | on the replacement: "Used in place of a null in `values`"; on its target, the null line adds "unless `nullValueDefault` is set"                                                                                                                                                                                                                                                                 |

- **The null line is omitted where null is nothing special,** a parameter typed `any` whose null is an ordinary value. fig-tree reports `nullPolicy: 'propagate'` on lazy `any` parameters such as `if.then` and `map.each`, but `propagate` is inert on any parameter that is not eager (fig-tree's operator contract), so the card reads their null as a value.
- **The wording is the editor's, generated from metadata,** so host operators get the same cards. The Evaluated line is shown even where the description says the same (`map.each`: "Evaluated per element, with $element and $index bound"), since it is the one line worded the same across every operator. Hosts cannot replace it in the first build; translation is designed in topic 8 ("Wording") and done later.

**No persistent marker for required or optional.** The card says it, required parameters already have no ✕ (topic 2's guards), and modifiers already look different (topic 3). Rejected: an asterisk or bold key on required parameters, or muted optional ones, which style every row for a distinction rarely needed while reading.

**The operator's own card**, shown on hovering the node's operator button (whose click still evaluates), carries topic 3's description tooltip and the `docUrl` link, and gains a line for the host's defaults for that operator, since they change behaviour without appearing in the tree: `hostFallback`, `hostNoCache`, and `hostDefault` on any parameter the node does not set ("This application sets `fallback: null` and `timeout: 5000` on every `http` node that doesn't set its own").

**The add-parameter picker** shows each entry's description, with no default: beside an entry, a default reads as the value choosing it gives, which is the seed (plan, 6.2). Showing defaults somewhere other than the hover card: do later.

**The `…Default` parameters get nothing of their own.** The Evaluated line says when they fire, the Replacement line ties an engine-applied default (`nullValueDefault`, `nullInputDefault`) to its target in both directions, and key order already puts them last. That covers fig-tree's two mechanisms, defaults the operator reads itself and defaults the engine applies, without the author needing to know which is which.

### Array constraints — **Agreed**

How topic 2's guards apply to arrays with declared constraints, and the rule behind every guard.

**The rule: the editor blocks an edit only where the metadata declares it,** as a required parameter, a fixed length, a positional binding or a literal-only position, **and only where the block leaves a valid next step. Everything else is allowed and reported by `validate()`** (topic 7). It decides cases not listed here. It also keeps editor-only machinery small: a guard reads what the slot already records, and anything that would need a rule of the editor's own is left to `validate()`.

- **A fixed length blocks only moves away from it.** With `constraints.length: 2`, an array with more elements can lose one but not gain one, an array with fewer can gain one but not lose one, and an array of exactly two can do neither. An array loaded at the wrong length is then fixable in the tree, not only through raw JSON.
- **Deleting the last element of an aggregate stays allowed.** `plus.values: []` is a `validate()` error, and `and`/`or`/`multiply` with `[]` a dead-expression warning, but "not empty" is enforced by each operator's own `validate` hook rather than declared, so the editor cannot read it. Rejected: asking fig-tree for a declared `constraints.minLength`, which would move the empty-aggregate checks out of every hook for little benefit.
- **The required fields of an `elementShape` element cannot be deleted** (`buildObject`'s `key` and `value`). They are slots with `role: 'field'` and a declaration marking them required ("Slots"), so the check that guards a required parameter guards them with no extra code, and json-edit-react's rename rule (a key that cannot be deleted cannot be renamed) follows. ＋ on an entry stays json-edit-react's free-typed key: offering only the missing fields would need a case of its own, and fig-tree ignores extra keys in an entry.
- **Changing an element's type so that it breaks `homogeneous` is allowed** (`18` to a string in `greaterThan`'s `['$data.age', 18]`). It is a content edit, `validate()` reports it, and the author may be about to change the other element too.
- Unaffected: arrays supplied dynamically (`values: '$data.list'`) have no element rows to guard; reordering does not change a count; positional payloads keep topic 2's rules, and deleting the last element of `{ $and: ['$data.x'] }` leaves `[]`, allowed as above.

### Caching — **Agreed** (Carl, with fig-tree 3.0.0-preview.4)

fig-tree caches where an operator's definition declares `cache: true` (the I/O operators), and nothing else can turn caching on ([fig-tree-evaluator#204](https://github.com/CarlosNZ/fig-tree-evaluator/issues/204)). The host turns an operator off with `noCache: true` in its `operatorDefaults` (`getOperators()`' `hostNoCache`), and an expression with `noCache: true` on an operator node or a fragment call, which turns caching off for the node and everything inside it. A call caches where its body does (`getFragments()`' `caches`).

- **"Add parameter" offers `noCache` only where it would do something** ("Adding parameters and starting values", above), starting as `true`, the only value it takes.
- **A node that caches says on its card whether its cache is in force.** On a caching operator, or a call to a fragment whose body caches, the node's own card has a line after the description: "Cache: active", or "Cache: disabled" where a `noCache` on the node or on any node holding it turns it off, or the host's does. A `noCache` several levels up is otherwise invisible from the node. The card doesn't say which `noCache` it is. A call to a fragment that only the host's `noCache` keeps from caching reports `caches: false`, so its card has no line.
- **The warnings are fig-tree's** (`useless-modifier`, at the key): dead where nothing inside could cache, and redundant where a node above already has `noCache` or, with the change made for the editor, where all that could cache is operators the host turned off ("'noCache' is redundant — caching is already disabled for 'http'").

---

## 5. References and `vars`, then comments and `literal`

### The vars block — **Agreed**

A `vars` block on an operator node, a fragment call, a shorthand node or a plain object. Earlier topics fixed its place and look: last among a node's keys, in the `$vars` colour and set slightly apart from the rows above (topic 3), `{ 2 vars }` when collapsed (topic 3), created as `{}` by "Add parameter" or the node's ＋ (topic 4), and each var a slot admitting `any` (topic 4).

**Drawn by the theme, with no component of its own.** json-edit-react renders the block as the plain collection it is, with its own edit tools (✎ for raw JSON, ＋, ✕). The editor's theme style functions, which receive each row's data and read the kind map, colour the `vars` key and give the block its left rule and tinted background, and `customText` gives the collapsed summary. The `vars` key carries topic 4's hover card, with the modifier's description ("Named values for this node and everything inside it"). So the vars block has no definition of its own, only theme styling, as for `fallback` and `noCache` (topic 1's table).

- Whether a collection's style can draw the rule and tint down the whole block is to be proved in Phase 9. If it cannot, the fallback is a Vars component that only wraps the child rows, with no caption.
- Rejected: a Vars component with a caption line ("vars · for this node and everything inside it"). Always-visible text goes against topic 3's uncluttered tree, and the hover card already says it.

**Var names are plain json-edit-react keys.** Only the `vars` key takes the `$vars` colour. The vars are ordinary rows, sitting on the block's tint, which already marks every row in it as a declaration. Rejected: names in the `$vars` colour to match their uses (`country` and `$vars.country`), which styles content the tint already sets apart.

**Adding a var takes two steps.** "Add parameter → `vars`" (or the node's ＋) creates `vars: {}`, then the block's ＋ asks for a name. json-edit-react cannot open an add-key input from code, since `startEdit` on its handle opens value edits only, and its edit tools appear on hover only, so an empty block gives no cue. Accepted for now.

- Rejected for now: asking json-edit-react for a `startAdd({ path })` on its handle, so that creating a block opens its name input at once (J8 in [v3-upstream.md](v3-upstream.md), dropped). To revisit if the two steps prove awkward in use.
- Rejected: seeding a new block with one var under a generated name (`var1`), which the author has to rename by double-clicking the key, and which is the kind of name that gets left in.

**A new var starts as `'Replace me'`, closed,** as json-edit-react leaves any other add (revised in planning Phase 9, Carl). The value is the starting-value rule's for an `any` slot. Until something reads it, a new var carries `validate()`'s `unreferenced-var` warning, which is true, so it stays. Rejected: opening it for editing with `editorRef.startEdit` once the add commits. A new parameter doesn't open, and a var shouldn't differ.

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

**A string comment** is a value row. **A multi-line comment** (`'//': ['line 1', 'line 2']`) is a plain json-edit-react array, one row per line, each line edited in json-edit-react's own input, with its ✕ deleting the comment. The theme gives the array the look of one note block. A comment has no type dropdown, since it is always a string (revised in planning Phase 9.4, Carl). A line is added through "Add parameter", which offers `//` again on a node whose comment is a note or lines and adds a line at its end, a string comment becoming the first of two; Shift-Enter inside the string gives a line break instead, which the note's `white-space: pre-wrap` shows. A comment of lines never has fewer than two: deleting one of two leaves the other as a string, and deleting the line of a one-line array deletes the comment.

- **Each line has a thin view-only definition:** json-edit-react's exported `StringDisplay` with quotes off and no truncation, since json-edit-react writes a string's quotes as literal text, which CSS cannot remove, and cuts strings off at `stringTruncateLength`. With `showOnEdit: false`, editing is json-edit-react's own input. The same definition serves a string comment.
- **The array keeps its json-edit-react header row,** which is where its ＋ and ✕ are: flattening it would lose both. A definition with `showKey: false` and no component, and the theme hiding its chevron and brackets, leave that row holding only the hover tools. Whether CSS can fold it into the block's top edge is proved in Phase 9, with the vars block's tint.
- **Comments never start collapsed.** A multi-line comment is one level deeper than its node's parameters, so at the host's `collapse` depth it would open as `[ 2 items ]`. The editor wraps the host's `collapse` filter to keep comment rows open.
- Rejected: drawing the array as one note through `renderCollectionAsValue`, which needs an editor of the editor's own. json-edit-react has no editor for an array on a value row, so with `showOnEdit: false` its "invalid value" input appears. The component would join the lines into one textarea and split them on commit (`fromStandardType`).
- Rejected: editing a multi-line comment only through its node's raw JSON.

**Other values** (`'//': { ticket: 123 }`, which the grammar allows) render as plain json-edit-react data with the `//` key's modifier styling and no note style, and edit like any data. Rejected: showing them as JSON text inside a note.

**A new comment starts as `'Comment...'`, closed** (revised in planning Phase 9, Carl): from "Add parameter → `//`" or the node's ＋ (topic 4), and a line added with the array's ＋ the same. Rejected: opening it for editing because the placeholder is only there to be replaced. A new parameter's placeholder is there to be replaced too, and parameters don't open.

### `literal` — **Agreed**

Topics 1, 3 and 4 settled its display (its display name and colours from `./editor-hints`, and the editor's own description, since `literal` has no `getOperators()` entry), its place in the picker (Data & objects), its content as plain data with no badge, and "Add parameter" offering only `//` on it.

**Switching a node to `literal` quotes it** (planning Phase 9, Carl). The usual case is an author finding that part of the tree is read as an expression when it should be data, so choosing `literal` in the operator picker makes the node, as it stands, the literal's content: `{ operator: 'plus', values: [1, 2] }` becomes `{ operator: 'literal', value: { operator: 'plus', values: [1, 2] } }`. The whole node goes in, its `//` and modifiers included, since everything quoted is quoted. It is the picker's, so it applies to full operator nodes. Switching away from a `literal` follows the ordinary rule (topic 2, "Node lifecycle"). The details are in the plan, 9.3.

**A new `literal` with nothing to quote starts with an explanatory string** (one the type dropdown has just created, or a host's `defaultOperators`): `value` is `'No content inside a literal node is evaluated'`, so the placeholder says what the node is for. It is the seed in `literal`'s `./editor-hints` entry (F4 in [v3-upstream.md](v3-upstream.md)), which the starting-value rule reads (topic 4). A string is harmless as content: it evaluates to itself. Rejected: the `any` type seed `'Replace me'`, which says nothing about the node.

**Do later: "Quote" and "Unquote",** actions that wrap a node or subtree in `literal`, or unwrap one, without going through raw JSON. The picker quotes a full operator node, so "Quote" is left for fragment calls, shorthand nodes and plain containers. To be reconsidered once the built editor can be tried.

---

## 6. Fragments

### Fragment-definition mode — **Parked**

The editor is also used to author fragment definitions (Conforma does). Agreed in principle: a host prop, working name `isFragmentDefinition`, puts the editor in that mode, so the rules that apply only inside a fragment body (`$params` above all) are switched on explicitly rather than inferred. Authoring a fragment is a distinct task, and the host always knows when it is doing it.

The rest is set aside, to be revisited further into the work (Carl, September 2026). It needs deciding what belongs in this editor and what the host handles around it, and designing it inside the editor risks bending decisions already made for expressions.

**What Conforma's fragment editor does.** The body is edited in the expression editor. Beside it, a separate JSON editor holds test parameters, and an "Evaluate with params" button evaluates the body as a call to the fragment with those arguments would. There is no validation of the body beyond what the expression editor itself shows. Something similar, outside the expression editor, is the likely starting point, but the validation problems below still have to be dealt with.

**What fig-tree 3.0.0-preview.1 does with a body,** checked against the installed package:

- **`validate()` cannot check a body.** It takes only `data`, `signal`, `timeout`, `mode` and `trace`, and it reports every `$params` reference as `unresolved-param` ("$params is only available inside a fragment body"), declared or not, bare `$params` and `$p.x` included. So a body in the editor today shows an error on every `$params` row.
- **The check exists but only registration reaches it.** The static checker resolves `$params` against a set of declared names (`runStaticChecks(artifact, { fragmentParams })`, `src/compile/staticChecks.ts`), which only `registerFragments` passes. A `validate()` option would pass the names through (F9 in [v3-upstream.md](v3-upstream.md)).
- **Registration's other checks cannot be reproduced by the editor.** The wrapper's strict shape, the declarations, defaults type-checked against their type, `required` with a `default`, and name legality are checked only by `new FigTree()` and `updateOptions()`. Both collect every issue (at paths such as `['fragments', name, 'parameters', 'x', 'default']`), and a failed `updateOptions()` leaves the instance unchanged. But the editor cannot build a scratch instance to run them, since an instance never returns its operator definitions (`getOptions()` omits them, and `getOperators()` returns info, not definitions), and calling `updateOptions()` on the host's instance would change it.
- **Cycles.** A body passed to `validate()` has no name, so if the fragment being edited is already registered, a call to itself compiles as a call to the registered version and nothing flags it. `getFragments()`' `dependencies.fragments` is transitive, though, so the editor can find every fragment whose use would close a cycle (the fragment itself, and every fragment whose dependencies include it) with no upstream change.
- **`evaluate()` refuses `$params`** with the same `unresolved-param` error, so evaluating a body, or a sub-tree of one, needs a way to supply the arguments (F10 in [v3-upstream.md](v3-upstream.md)).
- **Body warnings** survive registration on `getFragments()`' `warnings`, at paths relative to the definition (`['expression', 'vars', 'unused']`).

**Questions for when it is picked up:**

- **What the editor edits:** the body (`expression`) alone, with the declared parameters passed in by the host; the whole definition wrapper (`{ expression, parameters, description, metadata }`); or the body, with the declarations edited separately. And what stays outside the editor: the test parameters, the declarations, and evaluating with test parameters.
- **Validation:** checking the body as registration will, through F9, and where declaration errors are shown if the declarations are edited alongside.
- **`$params`:** the Parameter entry in the type dropdown ("The type dropdown", topic 4) and its scope, the declared parameters; and renaming a declared parameter, which F8 would serve.
- **The fragment picker in this mode:** never offering the fragment being defined, or any fragment whose use would close a cycle.
- **Evaluation:** of the whole body and of sub-trees, with test arguments, through F10.
- **Display:** the fragment's own `FragmentHints`, if the wrapper is edited.

**Until it is picked up,** nothing in Phases 4 to 10 depends on it: the Parameter entry is not offered, and a `$params` reference carries `validate()`'s `unresolved-param` error, as it would in any expression.

### The fragment picker — **Agreed**

The searchable list of registered fragments in a full fragment call's toolbar. It follows the operator picker (topic 4) wherever fragments allow.

**One flat list, in `getFragments()` order.** That is the order of the host's `fragments` object: `updateOptions()` appends new names at the end, and a replaced fragment keeps its place. Fragments have no category, so there are no groups. The host controls the order, as it controls the order of operators within a group, and a host that wants them alphabetical sorts them before registering them.

- Rejected: alphabetical by label. A host can always sort its own fragments, but it cannot undo a sort the editor imposes, such as putting the most-used fragments first or related ones together.
- Do later: groups from a host-supplied key, for example a `category` string in each fragment's `FragmentHints`, if hosts with long lists want them. `FragmentHints` is fig-tree's type, exported from its root, so that is an upstream addition.

**Each entry shows the display name, with the description beneath.** The display name is `FragmentHints.displayName`, and falls back to the fragment's name where there is none. The name is not added to the label.

- Rejected: "Display name (name)" as the label, following "Plus (+)".
- Rejected: the name as the label, as in v1, which throws away the host's display name where it helps most.
- Do later: a line listing the declared parameters ("country, fields?"), if descriptions prove too thin for choosing.

**Search** is always on, with its field focused when the picker opens, so typing then Enter works however many fragments there are (v1 showed search only from five). It matches the display name and the name, the name through `Select`'s `keywords` (topic 4, "Changes to `Select`"), and not the description, for the same reason as operators.

**Fragments that cannot fit the slot** move to a final "Not valid here" group, cannot be chosen, and show their reason in place of the description, exactly as operators do. The slot supplies what the position admits, as for operators. The fragment's side is the `returns` fig-tree infers from its body at registration and reports on `getFragments()` (F11 in [v3-upstream.md](v3-upstream.md)), since the editor never sees the body. `validate()`'s `returns-mismatch` check covers fragment calls with the same type, so the picker still blocks only what `validate()` rejects. The current fragment stays in its place and can be chosen even if it cannot fit. Many bodies have `get`, `if`, `match` or `http` at their root, which return `any`, so they fit everywhere.

- Rejected: the host passing the fragment definitions to the editor, for the editor to infer result types itself. It duplicates fig-tree's work, needs a prop that exists only to get round `getFragments()` omitting the body, and still disagrees with `validate()` unless fig-tree extends its check anyway.
- Not pursued for now: a `returns` declared on the fragment definition, which fig-tree's spec lists as maybe-later. It would give accurate types where a body returns `any`, but every author would have to write and maintain it. It could narrow an inferred `any` later.

**Where it opens.** On a new fragment call, with its starting fragment selected and the search field focused. The starting fragment is the host's default (`defaultFragment`, topic 8; v1's `defaultNewFragment`) where it is registered and can fit the slot, and otherwise the first fragment in list order that can. On a broken call (`fragment: 'alpah'`), with no current entry, and with the fragment its `unknown-fragment` issue suggests highlighted (`Issue.suggestion`, F3), as for operators.

**Re-selecting the current fragment closes the menu,** with nothing changed. Fragments have no aliases, so there is no spelling to toggle and no hint on the current entry.

**Other rules:**

- Registration warnings (`getFragments()`' `warnings`) are not shown on entries. They are for the body's author, and the author of a call cannot act on them.
- With no fragment registered, or none that can fit, Fragment is not offered in the type dropdown ("The type dropdown", topic 4) or in the node-type switch. A broken call on an instance with no fragments shows "No fragments registered" in the picker, and the node-type switch still offers Operator and Value.
- Hiding registered fragments from the picker: do later, with operators (topic 8).
- In fragment-definition mode (parked, above), the fragment being defined and any fragment whose use would close a cycle would be left out or disabled, using `getFragments()`' transitive `dependencies.fragments`.

### Switching fragment — **Agreed**

Choosing another fragment in the picker is a structural action (topic 2), so it cleans, by the same rule as switching operator:

- **The modifiers are kept:** `//`, `vars`, `fallback` and `noCache`.
- **Static arguments whose name the new fragment also declares are kept,** even where the kept value no longer type-checks against the new declaration, so the error shows and the author's work is not lost. The others are dropped, and the new fragment's missing required arguments are seeded by the starting-value rule (its `FragmentHints` seeds, then the type rule).
- **Dynamic arguments are kept unchanged** (`parameters: '$data.form'`, or a node): the editor cannot know what they compute, and they are checked at runtime.
- **An emptied `parameters` map is removed,** so switching to a fragment with no parameters leaves `{ fragment: 'today' }` rather than `parameters: {}`. The editor removes what the editor made obsolete (topic 2).
- **There is no confirmation step,** even when the switch drops argument subtrees. Cancel while the toolbar is open reverts it (topic 2, "Commit semantics").

---

## 7. Diagnostics and evaluation

### What fig-tree 3.0.0-preview.2 provides — **Findings**

Checked against the installed package:

- **`validate()` issues carry paths in the authored coordinates,** shorthand included (`['items', '$map', 'each']`), so they name json-edit-react rows directly. An issue points at a node (`missing-required`, `unknown-operator`, `malformed-node`, and `returns-mismatch` at the node doing the returning), at a key's row (`unknown-node-key` at `['age', 'thn']`, `useless-modifier` at `['x', 'fallback']`, a shorthand's `unrecognized-identifier` at `['condition', '$graeterThan']`), or at a string holding a reference token (`unresolved-var` at a `buildString` template). Severities are `error` and `warning`. Where fig-tree has a did-you-mean, the issue carries it as `suggestion` (F3 in [v3-upstream.md](v3-upstream.md)).
- **The sample-data warnings point at the reading rows.** Given `data`, `validate()` warns about each statically known `$data` path the data lacks (`missing-data-path`), once per reading node, at its path (F12 in [v3-upstream.md](v3-upstream.md)). A read inside a fragment body is reported at the call, naming the fragment.
- **A static error anywhere refuses the whole evaluation:** it rejects with the static issues and no trace. A sub-tree evaluation compiles only its synthesised expression, so it is refused only by errors inside the sub-tree or in the ancestor `vars` blocks wrapped around it.
- **A failure no `fallback` caught rejects the evaluation,** with the failing node's `path`; a failure inside a fragment body carries the call's `path` with `fragment` and `fragmentPath`, a location in a body the editor never receives. A failure a `fallback` caught is not thrown: the trace shows it as `status: 'fallback'` with the error it caught. (Superseded: 3.0.0-preview.2 also had a `mode: 'report'`, which degraded each failure's hole to `null` and returned the failures as `errors`. fig-tree removed it in 3.0.0-preview.6, [#208](https://github.com/CarlosNZ/fig-tree-evaluator/issues/208).)
- **The trace is an instance tree in authored paths:** one entry per node instance with its status (`value`, `failed`, `fallback`, `cancelled`, `skipped`), one entry per iterator element at the same path, reference entries with their resolved values, a fragment call's body nodes marked `source: { fragment }`, the compile warnings on the root, and events for cache hits, requests (header names only), renders and SQL queries. Values are held by reference.
- **`getDependencies()`** lists the `$data` paths read (with a `dynamic` flag where reads cannot all be listed), the operators and the fragments, transitively through fragment calls.

### Where issues attach — **Agreed**

**Each issue marks one row: the row at its path, or where that row is not drawn, the nearest drawn ancestor.** Nearly every issue path names a drawn row: `{ operator: 42 }` and `operator` beside `fragment` are reported at the node, not the filtered `operator` row, and a type error in `{ $not: 1 }` at the unlabelled `$name` row, which is drawn. A path into a flattened payload's own row (`parameters`, a named `$if: { … }`), or into a filtered row, lands on the node.

**A collapsed row carries the issues beneath it.** Its summary is coloured by the most severe of them, with a count where there is more than one ("2 errors"), as topic 3 decided for collapsed nodes, extended to every collapsed row, plain arrays and objects included, so that an error inside a collapsed `values: [ 3 items ]` is not hidden. Rejected: marking every ancestor of an issue, which clutters the whole path to it when the messages area already lists it; and rolling up only onto collapsed nodes.

**An issue at a node's own path.**

- **Broken** (topic 3's error border, with the name as an error) means exactly `malformed-node` at the node's own path or at one of its own keys (a stray sibling key such as `extra` in `{ $plus: [1], extra: 2 }`, a second `$name` key, or a fragment's `$name` row holding a string), or `unknown-operator` or `unknown-fragment` at its path: the node cannot be read as a node, and the compiler and `./format` both refuse it, so it has no Evaluate and no conversion. The key's own row carries the issue too. A node that is only missing something (`{ $if: ['$data.x'] }`, `missing-required` at the node) is well-formed, and converts.
- **Any other issue at a node's path is listed in the node's Evaluate button card,** with a "!" badge on the button's corner and no border: `upper` feeding a number position, a fragment call missing a required argument. The node is well-formed, so its header reads as usual.

**Severity on rows — revised** (Carl, plan 10.1, once the flags could be seen in the built editor, where a badge on every row was too much): **the tint marks the row, and the messages float in a card while the row is hovered.**

- **Error:** the row is tinted, with a stripe down its left edge (topic 3). A plain array or object is tinted as a whole block, its header line included (Carl, plan 10.1).
- **Warning:** the row is tinted fainter, in amber, with an amber stripe. Warnings are common and often transient (a new var carries `unreferenced-var` until something reads it, topic 5), and the fainter tint keeps a tree with a few warnings from looking as alarming as a broken one. Its amber must be told apart from the "filled in on load" marker's (topic 3), which is a stronger, purer yellow that fades (plan 10.3).
- **No hints.** fig-tree's one hint, `token-renumber`, was a guessed fix for the warnings beside it, so it folds into the `unbound-token` warning's wording, and the `hint` severity is gone (Carl; F17 in [v3-upstream.md](v3-upstream.md)).

A node isn't tinted. Its issues are listed at the top of its button's card, with the issues on the rows it holds that no nearer node holds (`thn`, or `round`'s array `value`): each issue goes to the one node nearest it, so the node's badge points at what blocks it, and an error deep in the tree doesn't mark every node above it (Carl). Rejected: a badge on every node an error blocks, for that cascade; and only the node's own issues, which left a blocked node unmarked while its card asked for a fix (Carl). The issues are listed without saying which row each is on, since fig-tree's messages name it. and a "!" badge over the button's top-right corner, red for an error and amber for warnings alone, ringed in white to stand off any button's colour, shows there is one without a hover (Carl). Rejected: a dot after the button, which didn't read as belonging to it; a triangle folded into the corner; and a warning or no-entry icon in the ▶'s place, which after a run competes with the ✓ for the one slot (Carl). Rejected: a flag on the header's line, the most severe message cut to fit, then "+1" and so on (Carl). Rejected, first: a flag on every row with an issue, errors tinted as well and warnings flagged alone, which made a tree with several issues busy (Carl). Rejected earlier: one treatment for every severity in different colours; and warnings in the messages area only, which moves a row's problem away from the row.

**What a row says: fig-tree's own messages,** in a card floating beneath its value, or at the top of a collection's rows, beneath json-edit-react's header line, which the editor can't add to (plan 10.1). The card lists every issue on the row, the most severe first, each with its severity, and shows while the row is hovered, except while the key's own card shows. It never moves the tree: every hover element floats (Carl). **A node's issues** come first in its button's card, above its usual lines or, after an evaluation, how it ran. **A card holding an issue shows sooner** than an informational one, after 0.2s against 0.5s, so a problem is quick to read while a card doesn't flash up on the way to a click; that includes a button's card saying why it can't evaluate (Carl). Messages work for every code, including a host operator's `validate` hook (`operator-validate`, with any message), and need no text of the editor's own. A collapsed row's count of issues goes after its summary, inside the summary text ("Operator: if · 2 errors", "3 items · 2 warnings"), rather than as a flag after its closing bracket, which a custom component can't reach either. Rejected: the editor's own short text per code ("not a parameter", "no such var"), which reads best but is a second copy of fig-tree's vocabulary, over 40 codes kept in step by hand and still nothing for host hooks; and an icon alone, which makes reading any problem take a hover.

**The sample-data warnings go on the rows that read the missing paths,** since fig-tree reports each at the path of its reading node (F12 in [v3-upstream.md](v3-upstream.md)): a reference string, a `get` with a literal path, or a string holding a `{{$data.…}}` token. A read inside a fragment body marks the call. Rejected: the editor checking the sample data itself with its walk and fig-tree's exported `resolvePath`, which duplicates `validate()`'s check and misses `get` paths and template tokens unless it re-implements them.

**How rows get their issues — Agreed** (Phase 5). The rule above is applied once per update, by a pure module that returns the issues by drawn row. The result goes to every component through `componentProps`, beside the classification, and to the theme's style functions. It keeps its identity while its content is unchanged, so only an edit that changes an issue re-renders the tree. That re-render can't be avoided: plain rows are tinted through the theme, and a new theme re-renders every row. Rejected: a React context, which spares only the editor's own components and goes around json-edit-react's route for configuration.

### The messages area — **Agreed**

The region below the tree that topic 3 proposed, as a sibling of the `JsonEditor` (Phase 2).

**It shows only when it has lines,** under a header of counts ("2 errors · 1 warning · 1 added") that collapses it, with a maximum height beyond which it scrolls, since a pasted expression can bring dozens of issues. The maximum height is a host prop, `messagesMaxHeight`, which also hides the region entirely when `0` (topic 8). Rejected: always shown, reading "No issues" when clean, which takes permanent space on every host; and collapsed by default, which leaves a new error signalled only by a changing count.

**What it holds:** every `validate()` issue; and one line per value filled in on load (topic 2). Evaluation failures stay out of it ("How it ran, in the tree").

**One list in tree order,** sorted by the row each line marks, as the tree displays it, so reading down the list is reading down the tree. On the same row the most severe comes first, then fig-tree's own order. The editor sorts, because `validate()`'s stream is not strictly in tree order (a node's own `missing-required` can follow a child's issue, and the sample-data warnings come after all the others). The filled-in lines are interleaved by their row. Rejected: grouped by severity, errors first, which separates the problems on one node when the pills already show severity (Carl was tempted by it; a sort or filter by severity could be added later); and grouped by node, a nested list that tree order already gives in effect.

**Each line** shows the severity pill, the path of the row it marks (not the issue's raw path, so a line for a flattened payload names the node), in display form (`[1].thn`, `displayPath`), the full message wrapped, and its quick fixes, as in mockup H1.

**Clicking the path reveals the row.** The editor expands the row's collapsed ancestors through `editorRef.collapse`, then scrolls to the nearest element it draws itself: the row where it has a component, otherwise the enclosing node's header, since json-edit-react's rows carry no marker of their path. This is expected to be close enough in most cases. No temporary highlight: the row already carries its marker. A `reveal({ path })` on json-edit-react's handle would scroll to the exact row (J9 in [v3-upstream.md](v3-upstream.md), Maybe); the editor's own handle has a `reveal` with the same signature (topic 8), which would then call it.

**Quick fixes,** in the messages area only:

- **Remove,** on an unknown key: `unknown-node-key`, and `malformed-node` at a stray sibling key (`{ $plus: [1], extra: 2 }`).
- **Rename to `then`,** where fig-tree suggests the name (F3), which also clears the `missing-required` the typo guard held back.
- **Change to `plus`,** on an unknown operator or fragment name where fig-tree suggests one (F3), the one-click form of the picker opening on the suggestion (topic 4).
- **Rename to `$greaterThan`,** on a `$` key that names no operator or fragment (`{ $graeterThan: [...] }`), where fig-tree suggests one on its `unrecognized-identifier` warning (F3). The object is plain data until the key is renamed, so it has no picker, and this is the only repair offered short of editing the key by hand. The suggestion keeps the sigil, so it replaces the key as written, and the renamed object becomes a shorthand node, which the fill-in step then completes (Carl, September 2026).
- **Dismiss,** on a filled-in line, and **Dismiss all** in the header when there is more than one.

Do later: the same fixes in the row's hover card ("Where issues attach"), which would need the card to stay open while the pointer moves into it.

**A filled-in line clears** when its row is edited or when it is dismissed (topic 2). Its row is edited when an edit of the row itself, or of a row inside it, is committed, its value changed or not; an edit of the node holding it counts only where it changes or removes the value (Carl, plan 10.3). While the row holds something else the line is hidden, and it comes back with the value, as on an undo.

**The filled-in marker fades — Agreed.** The marker on a row filled in on load, a highlight in the tint's shape with no badge (revised in plan 10.3, after 10.1's tints; A6's badge is superseded), fades after about three seconds, needing no edit, and its line stays until its row is edited or the line dismissed, so the record is not lost if the marker is missed (topic 3's proposal). Rejected: keeping the marker until the line is dismissed, which leaves every row filled in on a large load amber indefinitely. The fade applies only to that marker: issues from `validate()`, warnings included, stay on their rows and in the list for as long as `validate()` reports them, whether they were present on load or caused by an edit.

**What the host receives for its own rendering** is `onStatusChange`'s `messages` (topic 8): what `validate()` alone does not give, the filled-in lines, each line's resolved row, tree order, and fixes that apply to the expression.

### Evaluating — **Agreed**

What an Evaluate affordance does: the node's button, a reference's ▶, and the root container's bar (topic 3; a collapsed node's ▶ was dropped in plan 10.6). How a sub-tree is turned into an expression is "Sub-tree evaluation" (below); what the run leaves in the tree is "How it ran, in the tree".

**The host shows the result, and the tree shows how it ran — revised** (Carl, plan 10.7). The callback, `onEvaluate`, is called with each evaluation (topic 8, "Evaluation"), and the host shows the result as it likes, as the demo's toasts do: it is the primary result viewer. The editor adds what only it can, how the run went, marked on the rows themselves, with each row's value, error and time in its hover card for looking deeper ("How it ran, in the tree"). Rejected, agreed here first: a built-in result display, the value printed by type and sized by it, with a type caption, ✕ and copy, placed inline beneath the node's header, anchored and floating, or docked below the tree, and a prop to turn it off (`showEvaluationResult`). It duplicates what a host already does with the callback, and for a reference it needs a place json-edit-react's value row doesn't offer: the row is one line, and its component has nothing after the line to render into. Rejected before that: the host only, as in v1, with nothing in the tree, which leaves the author to find where a run failed by hand.

**One run at a time.** The tree shows the latest evaluation only, which fits one evaluation at a time (below). Several results at once, as toasts that stack, are left to the host through the callback, as the demo's toasts do.

**While it runs,** the affordance shows a spinner, as in v1, and nothing else does: the trace arrives whole as the evaluation ends, so the nodes inside can't show their progress one by one (Carl, plan 10.7). **Clicking it again cancels** the evaluation through an `AbortSignal`, so a slow request can be stopped without waiting for its timeout. **One evaluation at a time:** starting another cancels the one running. Rejected: several running at once, which can show a result beside the wrong expectation.

**A node that cannot be evaluated has its Evaluate disabled,** with the reason on hover ("Fix the 2 errors in this node to evaluate it"). fig-tree refuses an evaluation whose expression has a static error, so the editor disables the affordance where the issue list has an error at or under the node's path, or in what sub-tree evaluation would wrap around it: an ancestor `vars` block, or an enclosing iterator's `input` or `as`, which the `map` wrapper carries (plan 10.5). Warnings never disable it. At the root, Evaluate is therefore disabled while any error exists anywhere, as fig-tree would refuse it. A broken node has no Evaluate at all (topic 1). Rejected: leaving it enabled and showing the refusal in the popover, which offers an action that cannot succeed.

**What an evaluation uses.** The host's `FigTree` instance supplies everything but the call: its operators, fragments and options (HTTP settings, `timeout`, the cache, and `data`). The editor passes per call only `mode`, `signal`, `trace` (always on, "How it ran, in the tree"), and `data` where the host gives the editor sample data. That sample-data prop is optional: given, it is passed per call to `evaluate()` and to `validate()` (whose sample-data check reads it); absent, the instance's own `data` applies to both. So a host whose instance is shared across its application can give the editor sample data without `updateOptions()` on an instance it uses elsewhere. The prop is `evaluationData` (topic 8; v1's was `objectData`).

### Sub-tree evaluation — **Agreed**

The mechanics for topic 1's direction: a row is evaluated as a synthesised expression, the row wrapped in the scope its ancestors give it.

**How the expression is built.** The classification walk records each row's scope chain, the enclosing `vars` blocks and iterators, outermost first (topic 1). The row is wrapped from the inside out:

- **The row's value, as it stands,** with its own modifiers (its own `vars`, `fallback` and `//`).
- **For each enclosing iterator whose `each` contains the row:** a `map` over a copy of that iterator's `input`, with the same `as`, and the row as its `each`. All five iterators in fig-tree 3.0.0-preview.1 (`map`, `filter`, `find`, `some`, `every`) evaluate `each` per element over `input`, which `getOperators()` reports (`evaluation: 'perElement'`, `over: 'input'`), so host iterators work too. A row in `filter`'s `each` gives each element's predicate value.
- **For each enclosing `vars` block:** a plain object holding a copy of the block and the inner expression, `{ vars: <the block>, value: <inner> }`. A plain object's `vars` is consumed and its other keys evaluated in that scope, so the wrapper evaluates to `{ value: <result> }`; `value` is only the key that holds the row, and the editor reads the result back out of it. Wrappers nest in the chain's order, not merged, so shadowing and vars that read outer vars behave as in the tree.
- **A row with no enclosing scope is evaluated as itself,** the root included.

For example, evaluating the `multiply` node in

```js
{
  vars: {
    rate: 0.15
  },
  operator: 'map',
  input: '$data.orders',
  as: 'order',
  each: {
    vars: {
      shipping: 5
    },
    operator: 'plus',
    values: [
      '$order.total',
      {                                          // ← evaluated
        operator: 'multiply',
        values: ['$order.total', '$vars.rate']
      },
      '$vars.shipping'
    ]
  }
}
```

builds

```js
{
  vars: {                              // the root's vars block
    rate: 0.15
  },
  value: {
    operator: 'map',                   // standing in for the root map
    input: '$data.orders',
    as: 'order',
    each: {
      vars: {                          // the each node's vars block
        shipping: 5
      },
      value: {                         // the row, unchanged
        operator: 'multiply',
        values: ['$order.total', '$vars.rate']
      }
    }
  }
}
```

which, with `{ orders: [{ total: 100 }, { total: 20 }] }`, evaluates to `{ value: [{ value: 15 }, { value: 3 }] }`, shown as `[15, 3]` (checked against 3.0.0-preview.1; the whole expression gives `[120, 28]`).

**Which scope is taken.**

- **Every enclosing `vars` block is wrapped whole.** Vars are lazy, so those the row does not read cost nothing, but an error in any var of a wrapped block disables Evaluate ("Evaluating"). Rejected: keeping only the vars the row reads, transitively, which needs each reference resolved to its declaration, which the walk does not do (topic 5, "Showing scope").
- **The row's position decides the rest,** from the walk: a var's own row is wrapped with its own block too, since a var can read its siblings; an iterator's `input` and `as` are outside that iterator's bindings (`as` is literal-only, so it has no Evaluate); a `fallback` row has its node's scope; a branch that is not running (`if`'s `else` while the condition holds, a `match` branch) is evaluated anyway, giving what it would produce.
- **Ancestors' `fallback`s are not applied** (topic 1), so a failure inside the row is shown, not caught. **`$data`** is the sample data, or the instance's own ("Evaluating"). **`$params`** is parked with fragment-definition mode (topic 6).

**A result with one value per element** (a row inside an iterator's `each`) reaches the host as the array it is. In the tree, the row ran once per element, and its card lists each element's value ("How it ran, in the tree"), so it is not read as the row returning an array (revised in plan 10.7, from a caption in the result display, "one per element of `input` · 2 items"). Nested iterators give nested arrays. A row that does not read the binding still gives one value per element (`'$vars.shipping'` in the example gives `[5, 5]`), since the row does run once per element.

- Do later: stepping through the elements, one element's value at a time beside the element itself, with ‹ ›.
- Do later: wrapping in an iterator only where the row reads its binding. The walk sees references written as strings, but not `{{$order.total}}` tokens in a template, whose grammar fig-tree does not export, and one missed would make the evaluation fail with `unresolved-binding`.
- Rejected: a two-column table of elements and values.

**Paths are mapped back to the tree.** Error and trace paths come back in the synthesised expression's coordinates. For each wrapper, the editor records which part of the tree its pieces stand for, and translates every path through that record: the `value` chain to the row's own path, a wrapper's `vars` to the real block's path, a `map` wrapper's `input` to the real iterator's `input`. So a failure in an ancestor's var or input is shown at its real row ("How it ran, in the tree").

**A standalone function.** Building the expression is a distinct, self-contained operation, and its logic is intricate, so it is one pure function in a module of its own, with no React and nothing from the components mixed in (Carl). It takes the tree, the row's path and the scope chain the walk recorded for it, and returns the expression with the two ways back: reading the row's result out of the wrappers, and translating a path in the synthesised expression to the tree's. It is tested on its own, as the classification walk is (plan, working rule 4), including evaluation against fig-tree for each kind of scope.

**Evaluation mode — Agreed: fig-tree's one mode.** A failure no `fallback` caught rejects the evaluation, so one failure fails the whole row: the failed node is marked, the rows the run didn't reach are marked as never run, and the fallbacks used still show, from the partial trace the thrown error carries (`error.trace`). Resilience is fallbacks, in the expression or in the host's `operatorDefaults`. `trace` only records what happened at each node instance and never changes the result; with it on, a success returns `{ result, trace }`. `trace` is on for every evaluation.

- Superseded: report mode by default, with an `evaluationMode` prop for throw. fig-tree's `mode: 'report'` degraded a failed hole to `null`, completed everything else and returned every failure, which the editor showed as partial results and a card line for each null a failure left. Carl asked for report mode to be removed from fig-tree, since the two modes differ only for a row holding several holes ([#208](https://github.com/CarlosNZ/fig-tree-evaluator/issues/208)), and it went in 3.0.0-preview.6, taking `evaluationMode`, `Evaluation.mode` and a failure's `holePath` with it.

**The callback — sketched here, settled in topic 8 ("Evaluation").** The host's callback receives each evaluation as data. It returns nothing, and the editor never lets fig-tree's rejection escape to the host: it catches the thrown error and passes it on, so the host never wraps the editor in a `try`.

```ts
onEvaluate(evaluation: {
  path: Path                  // the row evaluated, in the tree
  result?: unknown            // when it succeeds
  error?: FigTreeError        // when it fails: the one failure fig-tree threw
  fallbacks: { path: Path, error: FigTreeError }[]   // the fallbacks that fired
  trace: TraceNode            // the raw trace, for a host that wants more
})
```

Every path it carries is in the tree's coordinates, the error's included, so fig-tree's error objects are wrapped or copied rather than passed through with their synthesised paths. Topic 8 settles it: a `status`, a `failure` in place of `error`, the trace's own paths left in the synthesised coordinates with `toTreePath` to map them, `onEvaluateStart`, and a `cancelled` status.

### How it ran, in the tree — **Agreed** (Carl, plan 10.7)

What an evaluation leaves in the tree, from its trace, which every editor evaluation records (`trace: true`, "Evaluation mode"), in place of a list in the result display (topic 7 had both "Showing failures" and a "Trace display" whose first item, the evaluated path in the tree, was do-later). The trace has an entry for every node instance in the evaluated row and the scope wrapped around it: its status (`value`, `failed`, `fallback`, `cancelled` or `skipped`), its value or error, its time (`elapsed`) and its events, with one entry per element inside an iterator. A row that didn't run is `skipped`, and what is inside it has no entry. `cancelled` is a race's losers, once the answer is known, and a node the instance's `timeout` cut off (checked against 3.0.0-preview.3).

**Which rows are marked:** every node inside the evaluated row (an operator, fragment call, shorthand or `literal` node) and every reference, and the parts of the wrapped scope that took part in the run: the iterator's `input`, and the wrapped `vars` blocks' vars, an unread one as never run. The evaluated row itself is marked whatever it is, so the root's bar shows how the whole ran. Plain data is marked too, as the trace records it: a constant, plain data holding no node or reference, as one piece, the rows inside it unmarked, and plain data holding a node or reference as itself, with each constant in it its own piece. The trace has an entry for a constant that is a parameter, an element or an entry of its own, but not for one beside a node or reference, which ran wherever what holds it ran. A `match`'s branches that are all constants are one constant, so the trace doesn't say which was taken, and nor does it for a list of constants. An `as` name and `useCache` configure their node, and aren't marked. Nothing outside the evaluated row is marked.

**How a row is marked:** a node's border, and the ▶ in its Evaluate button, or, where it never ran, the whole node dimmed.

| How it ran                                                       | Border | Button  |
| ---------------------------------------------------------------- | ------ | ------- |
| Ran                                                              | green  | green ✓ |
| Failed                                                           | red    | red ✕   |
| Failed, and its `fallback` caught the failure                    | amber  | amber ✕ |
| Cancelled                                                        | black  | ▶       |
| Never ran: skipped, inside a row that didn't run, or not reached | dimmed | ▶       |

- **A value from the cache** is marked as ran, and its card says it was a cached result. No icon reads as "cached" without a label, so none goes on the button (Carl, plan 10.7c). A node in the tree says so by its own cache lookup only, not its children's. A fragment call is the exception: fig-tree doesn't cache a call, and its body's nodes, whose lookups the trace records, have no rows of their own, so the call stands in for them, and is a cached result where its body made lookups and every one hit (Carl, plan 10.7c).
- **A fallback's mark is its node's,** the node that failed. Its `fallback` row is a row of its own, marked by its own run, and where the fallback fails too, the node is failed, its card saying so.
- **A node inside an iterator** ran once per element, and is marked by the worst of its runs: failed, then fallback, cancelled, ran and never ran.
- **A node that never ran is dimmed,** its border as it was, rather than given a grey border, which was too like a node's own (Carl). It shows in full while the pointer or focus is in it, since its hover cards and edit tools are drawn inside it and would dim with it. How far it dims is the stylesheet's `--ft-never-ran-opacity`. A reference, a plain value and a plain collection's rows that never ran are dimmed the same way, their keys left as a node's is.
- **Every constant that ran shows a ✓,** as one piece, as a reference does, so everything the run reached is ticked and everything it didn't is dimmed. The ✓ follows a value, as a reference's does, and a collection's closing bracket, on its own line or after its summary when collapsed. A container shows none, since each piece in it shows its own. Plain data has no card on its ✓ (Carl).
- **A reference has no border,** which would put a small box round every reference in a large expression (Carl): its ▶ becomes the ✓ or ✕.
- **A collapsed node** shows neither its border nor its button, so its summary text takes the colour, as it takes an issue's ("Where issues attach").
- **The root's bar** takes the button's mark and its card.
- **The evaluated row failing and part of it failing look the same:** each failure marks its own row, the evaluated row or one inside it.
- **Told apart from `validate()`'s errors:** an error inside a row disables its Evaluate ("Evaluating"), so no evaluated row holds a broken node, and a red border after a run is always the run's. With the ✓ and ✕, colour is never the only sign.
- **A cancelled evaluation leaves nothing:** a second click, or another Evaluate while it runs, resets the tree.

**A row's card** is the one its button or ▶ already has (topic 3), showing the run in place of its description until the marks go (Carl, plan 10.7c), in the mockups' frames R1 to R12 ([FigTree Run Cards](https://claude.ai/artifact/3hkLbe9Ki3mZLsi4XGYH75)). It starts with how the row ran, in the run's colour: "Ran", "Ran once per element", "Ran, cached result", "Failed", "Fallback used", "Cancelled" or "Never ran", then the time, in grey.

- **The value,** as compact JSON, strings quoted, so `'42'` and `42` differ, cut with "…" where it runs past three lines, since a card can't scroll and closes as the pointer leaves; the host has it whole. For a row inside an iterator, a line per element, each cut to one line, up to ten, then "+4 more", the failed ones marked.
- **A failure's message,** and where it came from a row beneath, which row, since every node above a failure fails with it. A failed fallback's `cause` ("the fallback also failed: …"), an `and` or `or`'s `related` failures as "+1 more", and for a failure inside a fragment body, "in fragment `ratio` at `expression.$plus[1]`", with `fragmentPath` in display form, since the body is not in the tree: a path in the registered definition, as fig-tree gives it, its body under `expression`. The host receives `fragment` and `fragmentPath` with the result, so a host that edits fragment definitions (Conforma) can open the body there.
- **A fallback's catch:** the failure it caught.
- **Why a row didn't run,** in general terms, from what the editor knows already, since the trace gives no reason: "evaluated only when needed" for a lazy parameter, element or entry; "not needed: the node succeeded" for a `fallback`; "never read" for a var; "stopped once the answer was known" or "stopped by the timeout" for a cancelled node; "inside `else`, which didn't run" for a row inside one; and "not reached" for a row the run stopped short of, as it does at a failure.
- **The time,** on every card of a row that ran, "<1ms" under a millisecond. fig-tree records none for a cancelled node or one that never ran (checked, plan 10.7c).
- **The evaluated node's card shows again as the result arrives.** The click hides it until the pointer leaves (plan 10.6b), so with the pointer still on the button, the result shows at once.

**When the marks go:** as soon as the expression starts to change, since they describe a run of the expression as it was. Any edit starting (json-edit-react's `startEdit`, `startRename` and `startAdd`, the toolbar's opening included, which is json-edit-react's session), any other change to the expression (`delete`, a quick fix, a conversion or respell, the host's own change or undo), and another evaluation starting. Not on collapsing, scrolling or clicking elsewhere, nor a change of `evaluationData`. A result whose expression changed while it ran (an edit doesn't cancel it, plan 10.6) isn't marked, since its paths may no longer be the rows'; the host has it. No ✕ or Esc to clear them: an edit or another evaluation does.

**Failures stay out of the messages area,** which holds the expression's static state (`validate()` issues and filled-in values), as `onStatusChange` reports it. They reach the host with the result. Rejected: "evaluation" lines in the messages area until the next edit, which would mix a run's failures with lasting issues and make the status report problems `validate()` does not.

- Do later: the precise reason a row didn't run ("`else`: `condition` was true", "branch `a`: `value` was `'b'`"), which the trace doesn't record. A reason on fig-tree's `skipped` entries would give it for every operator, host operators included, where rules of the editor's own would cover the core ones only (Carl: not now).
- Do later: each node's progress while the evaluation runs, which needs fig-tree to report trace entries as they settle.
- Do later: a card the pointer can move into, to scroll and copy a large value, which the quick fixes in a row's card need too ("The messages area").
- Do later: stepping through an iterator's elements ("Sub-tree evaluation").
- Not shown (Carl): requests and SQL queries, which the expression shows; how template tokens rendered, which the string shows; `buildObject`'s overwritten keys, a rarely used operator.
- Rejected: the failed row in `validate()`'s error style until the next edit, which mixes a run's failure with the expression's static state.
- Rejected: what each row evaluated to, dimmed after it ("→ 15", the trace display's first sketch), which needs something drawn on every plain value row, where the card needs nothing new.

### The dependencies view — **Agreed**

`getDependencies(expression)` gives the `$data` paths an expression reads, in traversal order, a `dynamic` flag where not every read can be listed (a computed `get` path, a bare `$data`, dynamic fragment arguments), and the operators and fragments it uses, all transitively through the fragments it calls. It is synchronous and cheap. An author would use it to see what data an expression needs (which form fields a Conforma expression reads, what the sample data must cover), and the operators list shows whether it does I/O.

**Nothing is built in.** The host already has the instance and the expression, so it calls `getDependencies()` itself and shows the result as it likes: unlike the messages area, the editor would add nothing a host cannot get directly.

- Do later: a "Reads" list beside the messages area ("Reads: `user.name`, `orders[*].total`, and reads that cannot be listed"; "Uses: `http` · fragments: `getCapital`"). Its paths could not link to the rows that read them, since `getDependencies()` gives paths but not where they are read, the same gap as the sample-data warnings; reading-node paths like F12's would close it.
- Rejected: each node's reads in its operator hover card, for its sub-tree, which costs a `getDependencies()` call per hovered node on the synthesised sub-tree expression.

---

## 8. Public API

The `FigTreeEditor` props, the callbacks and handle, theming, and what the package exports. Earlier topics deferred items here; they are worked through in this order, each building on the ones before:

1. **How the props relate to json-edit-react's** (A1).
2. **The expression and loading:** `expression` and `setExpression`, and completion on load and undo (topic 2, "Commit semantics").
3. **Telling the host about state:** `onStatusChange` (topic 2, "Reporting state to the host"), what a host drawing its own messages receives (topic 7), and the messages area's hide and maximum-height props.
4. **The handle and edit sessions:** the imperative handle, and whether the host needs edit-session boundaries for `useUndo` (topic 2, "Undo history"; J3).
5. **Evaluation:** the sample-data prop (v1's `objectData`), the `onEvaluate` callback with v1's `onEvaluateStart` and cancelled evaluations, and the evaluation-mode prop (topic 7). A prop turning off the built-in result display was agreed here, and went with the display (plan 10.7).
6. **Defaults and what the pickers offer:** the default operator for each slot type (topic 4), the default fragment (topic 6), a preference for aliases on new operators (topic 2), hiding operators and fragments from the pickers (topics 4 and 6), an expected result type at the root (topic 4, "Slots"), v1's `addTopLevelFallback`, and the reserved name `isFragmentDefinition` (topic 6, parked).
7. **Display overrides:** the host's display-data layer (topic 4, "The operator picker"; v1's `operatorDisplay`), and the default colour for host operators that have none.
8. **Theming and CSS:** the editor's own tokens (topic 3; J5 in [v3-upstream.md](v3-upstream.md)), how they combine with json-edit-react's `theme`, and a standalone `./style.css` (plan, Phase 3).
9. **Wording:** whether a host can replace the editor's text (topic 4, "Parameter metadata").
10. **Package exports.**

### How the props relate to json-edit-react's — **Agreed**

**`FigTreeEditorProps` extends json-edit-react's props,** as in v1 and the Phase 2 skeleton, so every json-edit-react prop the editor does not need for itself is available to the host unchanged, new ones included as json-edit-react gains them. The cost, accepted: json-edit-react's prop names are part of the editor's public API, so a json-edit-react major that renames a prop is an editor break. The editor controls which json-edit-react it depends on, so it adopts such a bump deliberately: at a fig-tree major (the version policy), or keeping the old name as an alias until then.

Every json-edit-react prop falls into one of four groups:

| Group              | Props                                                                                                                                                                                                                                                                                  | Rule                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Replaced**       | `data`, `setData`, `allowTypeSelection`, `newKeyOptions`, `defaultValue`; `customNodeDefinitions` until host definitions are built (below)                                                                                                                                             | Left out of the props type, so passing one is a type error. v1 silently ignored a host's `customNodeDefinitions`, `customText` and `theme`.                                                                                     |
| **Combined**       | `allowEdit`, `allowDelete`, `allowAdd`, `allowDrag` (left out of the props type until J4, while dragging is disabled; plan, 6.4), `collapse`, `onCollapse` (the editor records each toggle, plan 8.4), `editorRef`, `onEditEvent`, `className`, `theme`, `customText`, `customButtons` | The host's applies, and the editor's is added: the guards only add restrictions (topic 2), handlers are both called, and `customText` uses the host's entry where the editor's returns `null`. `theme` is settled with theming. |
| **Editor default** | `showArrayIndexes: false`, `indent`, the `collapse` depth, `stringTruncateLength`                                                                                                                                                                                                      | The editor sets them, as v1 did, and the host can override them. An override changes only how the tree looks.                                                                                                                   |
| **Passed through** | everything else: `onUpdate` (below), `rootName`, search, `translations` (Combined once the editor's own strings join it, "Wording"), `keyboardControls`, `jsonParse`, `jsonStringify`, `TextEditor`, `Select`, `onCopy`, the width and font props, …                                   | Unchanged.                                                                                                                                                                                                                      |

**`id` is the editor's** (plan, 10.2): it goes on the editor's outer container, which holds json-edit-react's container and the messages area, rather than on json-edit-react's container, so a host reaches one instance's parts from it (`#rules > .ft-message-container`). json-edit-react uses it as the DOM attribute alone. `className` stays on json-edit-react's container.

**The editor's own props never reuse a json-edit-react name for another meaning.** Where the editor needs a json-edit-react name (`customNodeDefinitions`, `translations`), its meaning is json-edit-react's, extended.

- Rejected: a curated subset of json-edit-react's props, which would free the editor's API from json-edit-react's but make every json-edit-react feature a host wants an addition to the editor, and break every v1 host.
- Rejected: json-edit-react's props in a separate `jsonEditorProps` object, which removes the possibility of a name clash that careful naming already avoids, at the cost of a clumsier and v1-breaking API.

**Host custom node definitions — Agreed, do later.** A host may want its own definitions for plain data in the tree, such as `@json-edit-react/components`' `booleanToggleDefinition()` on `caseInsensitive`, or a hyperlink or Markdown display inside a `literal`. The host's `customNodeDefinitions` would be combined with the editor's, in this order:

1. **The editor's own definitions,** so a host definition can never take a node, a payload row, a reference or a comment.
2. **The host's, each condition wrapped to match plain rows only:** rows with no kind of the editor's own (topic 1's map), which means plain values, in evaluated positions or quoted, and plain collections that contain no node or reference. A host collection definition on a container with holes would otherwise hide the nodes inside it.
3. **The editor's catch-all,** which carries only the parameter hover card (topic 4, "Parameter metadata").

To settle when it is built:

- A host definition matched at a row with a slot gets the editor's hover-card `keyComponent` where it has no key component of its own, since a row takes only its first matching definition's.
- A host definition's type-selector entry (`name` with `showInTypeSelector`) is not offered at first, since the editor's `allowTypeSelection` builds each row's options from its slot. Offering it at slots whose type fits could follow.
- The editor memoises the combined array on the host's, so the host passes a stable array, as json-edit-react already asks: a new array re-renders every row (topic 1, finding 6).

Adding the prop later is an addition, not a break, so the first build leaves it out of the props type. Do later: the editor using `@json-edit-react/components`' definitions itself, such as a boolean toggle on boolean parameters, which would add a dependency.

### The expression and loading — **Agreed**

**The expression is controlled:** `expression: unknown` and `setExpression`, as in the Phase 2 skeleton. Every change reaches `setExpression` whatever its route (json-edit-react's edits, the toolbar, conversions, quick fixes, Cancel's revert), complete, and invalid ones included (topic 2). `setExpression` is where a host saves.

```ts
setExpression: (expression: unknown, options?: { autoUpdate?: boolean }) => void
```

**Writes the author did not make are marked `{ autoUpdate: true }`.** An authored edit, the usual case, passes no second argument. The editor writes without an authored action only to apply the fill-in step to an expression it was given: one that arrives from outside (any `expression` value other than the last one the editor wrote, so undo and redo included), or whose completion changes because the registry did. The editor renders what it writes: json-edit-react's principle that the tree shows the data as it is holds, so the completed, ordered expression is written, not only displayed. An expression that arrives already complete and in order produces no write, so the editor never re-emits on re-render, expand or undo, as v1 did.

The marker exists for hosts that keep history or track unsaved changes. With `useUndo`:

```tsx
setExpression={(expression, options) => (options?.autoUpdate ? replace(expression) : set(expression))}
```

and a host with a dirty flag sets it only when `autoUpdate` is absent. A plain `useState` setter ignores the argument.

Why it is needed, with `useUndo`'s `set` passed straight in: the host calls `reset(E0)` with an incomplete expression; the editor completes it to E1 through `set`, recording E0 as a step; after an edit and two undos, E0 arrives again, the editor completes it again through `set`, which records a step and clears redo. So Undo appears to do nothing, loses the edit, and stays enabled. Conforma meets the same problem with v1, which re-emits key-reordered expressions, and works around it in every screen that uses the editor with undo (`useInitialiseMultipleExpressions`): a 500 ms initialisation phase that collects the first writes and applies them with one `reset`, then comparing every write, ignoring identical ones and sending reordered ones to `replace`. With the marker, that machinery goes.

- Rejected: a separate `replaceExpression` prop for unrecorded writes, a second setter that means nothing to a host without history.
- Rejected: always passing a `{ cause }` argument, when the authored edit is the usual case and needs nothing.
- Rejected: exporting the fill-in step for the host to run before `reset`. The editor would then have nothing to mark as filled in on load, and it would not cover an expression arriving again through undo. Exporting it for other uses (normalising stored expressions) is for "Package exports".
- Rejected: the editor never writing on its own, ordering keys for display only and completing only on structural actions. It breaks json-edit-react's principle that the editor shows the data as it is.

**The host's `onUpdate` is json-edit-react's, passed through untouched.** It is json-edit-react's check on its own edits (edit, add, delete, rename, move), with which a host can reject an edit with a message on the row or confirm it asynchronously. The editor needs nothing from it: the fill-in step runs on the `setData` path. It sees every edit made in the tree, the toolbar's included, since the editor's components commit through `setValue` (topic 2, "Commit semantics"), and it does not see the editor's other writes: quick fixes from the messages area and `autoUpdate` writes. The docs say so, and that saving belongs in `setExpression`, which receives everything; the demo, which saves in `onUpdate`, moves its save there. If the "Update references" quick fix (topic 5, do later) reads the tree from before a rename through `onUpdate`'s `rename` event, `onUpdate` moves to Combined then, with no change for hosts.

### Telling the host about state — **Agreed**

Two kinds of host need the editor's state: one gating its own actions (a Save button disabled while there are errors or an edit is open), and one drawing its own messages in place of the built-in area. The second can call `validate()`, but not get what the editor adds (topic 7): the filled-in lines, the row each line marks, tree order, and the quick fixes. One callback serves both.

```ts
onStatusChange?: (status: EditorStatus) => void
messagesMaxHeight?: number | string

type EditorStatus = {
  valid: boolean // no errors; warnings and filled-in values do not count
  counts: { errors: number; warnings: number; filledIn: number }
  editing: boolean // an edit session is open: a value, raw JSON or the toolbar
  messages: EditorMessage[] // what the messages area lists, in its order
  uncovered: Path[] | null // top-level values with no fallback; null while there are errors
}

type EditorMessage = {
  row: Path // the row the line marks, resolved as the messages area resolves it
  message: string // the line's text: the issue's own message, or the filled-in wording
  fixes: { label: string; apply: () => void }[] // Remove, Rename to `then`, Dismiss, …
} & ({ kind: 'issue'; issue: Issue } | { kind: 'filledIn' }) // fig-tree's issue, unchanged
```

`message` on every line, and the union in place of an optional `issue`, were settled in building (plan 10.4).

- **It is called when the status changes,** compared by content (counts, `editing`, a line added, removed or changed), not on every render, and once as the editor mounts.
- **`editing` covers every session, the toolbar's included.** Toolbar changes are committed as they are made, but Cancel can still revert them, so a host saving mid-session would save an intermediate state. The toolbar's reopening after each commit happens in the same event handler, so `editing` does not flicker. Closing a session before saving is the handle's ("The handle and edit sessions").
- **`uncovered` is fig-tree's `fallbackCoverage`** (3.0.0-preview.6, [#209](https://github.com/CarlosNZ/fig-tree-evaluator/issues/209)), under the instance's options: the top-level values a failure could get out of, each a place a `fallback` belongs. The check takes every operator and fragment call to be able to fail, so it flags values that can't, and the editor draws nothing for it: the host decides whether and how to show it. It means something only for a valid expression, so it is null while there are errors. A host that passes its own `timeout` to `evaluate()` calls `fallbackCoverage` itself, with that timeout.
- **Each fix carries an `apply` function,** running the same code as the built-in button, so a host needs no logic of its own to offer it. The status is therefore not serialisable, which a callback does not need.
- **Revealing a row** from a host's own line is a method on the handle, not a field on each message.
- **`messagesMaxHeight`** sets the built-in area's maximum height, beyond which it scrolls, and **the number `0` hides the area entirely,** its header of counts included, for a host that renders its own. Only the number counts: a CSS string (`'0px'`, a `calc()`) is used as a height, since the editor cannot reliably tell whether one comes to zero. The default is settled when built. The name follows json-edit-react's `minWidth` and `maxWidth`.

- Rejected: a separate `showMessages` boolean, one prop more for what `0` already says.
- Rejected: separate callbacks (`onValidityChange`, `onEditingChange`, `onMessagesChange`), which a Save button needing two of them would have to combine.
- Rejected: a render prop for the messages area (`renderMessages`), a second mechanism beside the callback a Save button needs anyway.
- Rejected: `validate()`'s raw issues only, topic 2's first sketch, which leaves out the filled-in lines, resolved rows and fixes.

### The handle and edit sessions — **Agreed**

**The handle is json-edit-react's, extended,** since `editorRef` is json-edit-react's prop (Combined, "How the props relate to json-edit-react's"), merged with the editor's own ref:

```ts
editorRef?: React.Ref<FigTreeEditorHandle>

interface FigTreeEditorHandle extends JsonEditorHandle {
  // json-edit-react's collapse, startEdit, confirm and cancel, and:
  reveal: (options: { path: Path }) => true | 'PATH_NOT_FOUND'
}
```

- **`reveal({ path })`** does what clicking a path in the messages area does (topic 7): expands the row's collapsed ancestors and scrolls to the nearest element the editor draws. It serves a host that draws its own messages, and returns what `startEdit` returns for a path that is gone. Its signature follows `startEdit({ path })`, and matches J9's, so if json-edit-react gains `reveal` the editor's delegates to it, with no clash of names.
- **`confirm()` and `cancel()` keep json-edit-react's meaning on a toolbar session.** `confirm()` clicks the session's registered confirm control (`editConfirmRef`, which custom components receive), which on the toolbar is ✓, so it closes it. `cancel()` ends the session, and on the toolbar keeps its changes: they are already committed, and what is committed stays committed. Only the toolbar's own ✗ and Esc revert. Either way nothing is left uncommitted, which is what a host calling them before saving needs.
- Do later: `evaluate(path?)` on the handle, for a host's own Evaluate button (the demo's).

**Edit sessions need nothing from the editor.** Each toolbar action is its own json-edit-react session, committed and reopened ("Commit semantics", topic 2), so a host's `onEditEvent` sees it as json-edit-react reports any edit, and a host with undo records one step per action.

- Rejected: an `onEditSession` callback reporting when the toolbar opens and closes, so a host could group a whole toolbar use into one undo step (J3 in [v3-upstream.md](v3-upstream.md), dropped). It is editor-specific API for a small nicety.
- Rejected: `useUndo` grouping each session from the `onEditEvent` it already takes. Under json-edit-react's documented toolbar pattern every action is its own session, so it would group nothing.

### Evaluation — **Agreed**

The props for topic 7's evaluation design:

```ts
evaluationData?: Record<string, unknown> // what `$data` is in the editor's evaluations and validate()'s sample-data check
onEvaluateStart?: (start: { path: Path }) => void
onEvaluate?: (evaluation: Evaluation) => void

type Evaluation = {
  path: Path // the row evaluated, in the tree
  status: 'done' | 'failed' | 'cancelled'
  result?: unknown // on 'done'
  failure?: EvaluationFailure // on 'failed': the failure fig-tree threw
  fallbacks: { path: Path; error: FigTreeError }[] // the fallbacks that fired
  trace?: TraceNode // fig-tree's own; absent when cancelled
  toTreePath: (path: Path) => Path // maps a path in `trace` into the tree
}

type EvaluationFailure = {
  message: string
  path: Path // the failed row, in the tree
  fragment?: string // for a failure inside a fragment body
  fragmentPath?: Path
  error: FigTreeError // fig-tree's original, in the synthesised expression's coordinates
}
```

- **`evaluationData`,** given, is passed per call to `evaluate()` and `validate()`; absent, the instance's own `data` applies to both (topic 7, "What an evaluation uses"). It cannot be `data`, which is json-edit-react's ("How the props relate to json-edit-react's"). It takes fig-tree's own type for `data`, `Record<string, unknown>` (plan, 10.1). Rejected: v1's `objectData`, fig-tree v2's wording; and `sampleData`, topic 7's wording, which misdescribes a host such as Conforma that passes the application's real context.
- **`status`** tells the outcomes apart without inspecting the other fields. `'failed'` means the row produced no value: a failure no `fallback` caught, which fails the evaluation as a whole, as a timeout does, or an evaluation fig-tree refused.
- **One `failure`,** in place of the sketch's `error`, wrapped so its path is the tree's.
- **Every path is in the tree's coordinates except the trace's.** Translating a whole trace for a host that rarely reads it is wasted work, so the host gets `toTreePath`, built from the mapping sub-tree evaluation already records (topic 7). At a row with no enclosing scope it is the identity.
- **Every `onEvaluateStart` is followed by exactly one `onEvaluate`,** with `'done'`, `'failed'` or `'cancelled'`. A cancel is clicking the running affordance again, or starting another evaluation, in which case the host sees the running one's `'cancelled'` before the new one's start. So a host drawing results can clear a stale one and show that one is running, and a spinner it shows is always stopped. Nothing in the v1 demo or Conforma uses v1's `onEvaluateStart`, but v1 had no built-in display, so no host yet drew results itself in the way topic 7 allows. v1's `onEvaluateError` is covered by `status: 'failed'`.
- **`onEvaluate` returns nothing** and the editor never lets fig-tree's rejection escape to the host (topic 7).
- Rejected: dropping `onEvaluateStart` and not reporting cancelled evaluations. It leaves a host's result display unable to tell a stale result, or that one is running.

### Defaults and what the pickers offer — **Agreed**

```ts
defaultOperators?: OperatorDefault | Partial<Record<SlotType, OperatorDefault>>
defaultFragment?: string

type SlotType = 'any' | 'number' | 'string' | 'boolean' | 'array' | 'object'
type OperatorDefault = string | { operator: string; [key: string]: unknown } // a name, or a whole full node
```

**`defaultOperators`** sets the operator a new node starts as, by its slot's type (topic 4, "The type dropdown"). A map is merged over the built-in one; **a single value applies to every type**, as v1's one default did. An object with an `operator` key is a whole node, and any other object a map, so the two cannot be confused: `operator` is never a slot type. A whole node is a full operator node, since choosing Operator gives a full node, whose picker opens in its toolbar; a shorthand node has no toolbar (plan, 6.1). It is plain data, so a host can keep it in a stored preference, as Conforma keeps its defaults. A name is used as written, and a whole node as given; either way the node is then completed by the fill-in step, and whether it fits is judged by its operator. A default that is not registered or cannot fit its slot falls back as topic 4 sets out (the `any` entry, then the first operator in category order that fits), so a host's defaults never create a node that is an error from the start. The built-in defaults, and the prop's shape, may be revised once the editor can be tried (Carl).

With the built-in map and fig-tree 3.0.0-preview.2's seeds, choosing Operator in the type dropdown gives:

| Row                         | Slot admits       | Type used                 | New node                                                                |
| --------------------------- | ----------------- | ------------------------- | ----------------------------------------------------------------------- |
| `if.condition`              | `any`             | `any`                     | `{ operator: 'plus', values: [1, 2, 3] }`                               |
| `round.value`               | `number`, `null`  | `number`                  | `{ operator: 'plus', values: [1, 2, 3] }`                               |
| `round.decimals`            | `integer`         | `number`, by fallback     | `{ operator: 'plus', values: [1, 2, 3] }`                               |
| `upper.value`               | `string`, `null`  | `string`                  | `{ operator: 'buildString', template: 'Hello {{$data.name}}' }`         |
| `buildString.trim`          | `boolean`         | `boolean`                 | `{ operator: 'equal', values: ['These are equal', 'These are equal'] }` |
| `map.input`                 | `array`           | `array`                   | `{ operator: 'map', input: [1, 2, 3], each: '$element' }`               |
| `buildString.substitutions` | `array`, `object` | `array`, the first member | the same `map` node                                                     |

One value for every type, as Conforma's setting would be in v3:

```tsx
<FigTreeEditor defaultOperators={{ operator: 'get', path: 'path.to.value', fallback: null }} />
```

gives that node at every row above, since `get` returns `any`. Switching it to `round` keeps `fallback: null` and drops `path` (topic 2), giving `{ operator: 'round', value: 3.14159, fallback: null }`.

A partial map:

```tsx
<FigTreeEditor
  defaultOperators={{
    number: '+',
    string: { operator: 'upper', value: '$data.name' },
    array: 'round',
  }}
/>
```

gives `{ operator: '+', values: [1, 2, 3] }` at `round.value` and `round.decimals` (the name as written; picking `multiply` next gives `*`), `{ operator: 'upper', value: '$data.name' }` at `upper.value`, and at `map.input` the built-in `any` entry, `plus`, since `round` returns a number and cannot fit an array slot. `if.condition` and `buildString.trim` keep the built-ins.

**The built-in `string` default reads a reference:** `buildString`'s `template` seed is `'Hello {{$data.name}}'`, with no `substitutions` seed (F13 in [v3-upstream.md](v3-upstream.md)). Without data it renders `'Hello '`, with sample data that has no `name` it carries a `missing-data-path` warning, and under `strictDataPaths` it fails when evaluated. It is valid, so it stays: accepted for now (Carl, September 2026). Rejected: seeding a new node's optional parameters wherever the operator's seeds cover them, which adds `else`, `from`, `default` and `as` to new `if`, `get` and `map` nodes.

**Preferring aliases needs no prop of its own.** A host writing `'+'` in `defaultOperators` gets `+`, and topic 2's switching rule keeps the alias where the next operator has one. Rejected: a separate spelling-preference prop.

**`referenceNames`** (plan, 8.3; Carl) sets how the editor spells every reference it writes: `'canonical'` (`$data`, `$vars`, `$element`, `$index`, `$params`), the default, or `'alias'` (`$d`, `$v`, `$e`, `$i`, `$p`), in fig-tree's own terms (`./format`'s `referenceNames`). It covers the type dropdown's starts (`$data.` or `$d.`) and the conversions, which respell every reference in the subtree they convert, the author's own included, as fig-tree's option does. Only typing writes the other spelling. Unlike an operator's alias, a reference's spelling can't be given through a default, since the editor makes references up itself. No switcher: a reference is easily retyped.

**v1's `addTopLevelFallback` is dropped.** Its one known use, Conforma's `null`, is served by a default node carrying `fallback: null`, which topic 2's switching rule keeps through every operator switch. The difference, for the migration note: a root written as raw JSON does not gain the fallback. Rejected: a rule adding a fallback to any root without one, which would change the tree on content edits.

**`defaultFragment`** names the fragment a new call starts as (v1's `defaultNewFragment`), where it is registered and can fit the slot, otherwise the first fragment in the picker's order that can (topic 6). Its arguments are seeded as usual. v1's `defaultNewCustomOperator` goes, since host operators are ordinary operators.

**Do later:**

- **Hiding operators and fragments from the pickers** (topics 4 and 6), as two lists of names, `hiddenOperators` and `hiddenFragments`: a hidden entry is left out of the pickers, their search and default resolution, and still shown as the current entry on a node that uses it. No v1 host needed it, and adding the props is not a break.
- **An expected result type at the root** (topic 4, "Slots"), for a host such as Conforma whose visibility conditions expect a boolean. fig-tree has no notion of it, so `validate()` never reports a mismatch at the root, and moving operators to "Not valid here" there would block what `validate()` accepts (topic 4's rule). Built, it would steer the root's default operator and type dropdown only, or come with an issue of the editor's own; it needs its own design.
- **`isFragmentDefinition`** stays parked with fragment-definition mode (topic 6), with no prop until that is designed.

### Display overrides — **Agreed**

**The host's display layer is two props, named and shaped after fig-tree's own exports:**

```ts
operatorHints?: { [operator: string]: Partial<OperatorHints> } // keyed by canonical name
categoryHints?: { [category in OperatorCategory]?: Partial<CategoryHints> }
```

- **They are the top layer** of topic 4's display data: `./editor-hints` (`literal` included), a host operator's `metadata` read as `OperatorHints`, then these. Each field is merged over the layers beneath, and `seeds` per parameter, so overriding one seed keeps the rest. `literal` is overridden like any operator.
- **What a host uses them for:** its own display names (and translations of them, "Wording"), `docUrl`s into its own documentation, colours, and seeds that suit its data (an `http.url` on its own server). `categoryHints` relabels or reorders the picker's groups.
- **Plain data** in fig-tree's shapes, so a host can type them with fig-tree's own types and keep them in a stored preference, as with `defaultOperators`.
- **Fragments have no override prop.** A fragment's display is `FragmentHints` in its own `metadata` (exported from fig-tree's root: the operator shape with `docUrl` optional), which the host already controls. The editor reads each of its fields as optional, since it is a convention fig-tree never checks: a fragment with no display name shows "Fragment" (topic 3).
- Rejected: v1's name, `operatorDisplay`; and one prop holding both (`displayHints={{ operators, categories }}`), a wrapper that gains nothing over two props named after what they mirror.

**A host operator with no colours takes a light shade of its category's colour,** so it sits with its category's siblings, as topic 1's first-class principle wants. `categoryHints` gives each category its hue at full strength, with white text, and every operator button is a light shade of that hue, so the category's own colours would make a dark button, which reads as a fragment (topic 3, "Fragment default colour"). The shade is derived in CSS, the background as `color-mix(in srgb, <category colour> 18%, white)` and the text as `color-mix(in srgb, <category colour>, black 65%)`, with a test that the pair reaches 4.5:1 for each core category; the exact proportions are settled when built.

- Rejected: asking fig-tree to add the light pair to `CategoryHints`, which keeps the colours in one place but is another upstream item for what CSS already does.
- Rejected: one neutral colour for every host operator, which marks them as different.

### Theming and CSS — **Agreed**

**The editor's own colours are an `editorTheme` prop:** a short list of values specific to FigTree, mostly colours, applied inline as json-edit-react applies its theme, so a host sets them in the same place and the same way as json-edit-react's `theme`, rather than in a stylesheet disconnected from the component.

```ts
editorTheme?: Partial<EditorTheme>

interface EditorTheme {
  refData: string // reference namespaces (topic 3)
  refVars: string
  refParams: string
  refBinding: string // $element, $index and `as` names
  varsBlock: string // the vars block's tint and rule (topic 5)
  modifierKey: string // the `//`, fallback and noCache keys (topic 3); the vars key takes refVars
  comment: string // a comment's text (topic 5)
  commentBlock: string // a comment's stripe, tint and icon
  error: string // row tint and a node's badge (topic 7)
  warning: string // the same for a warning
  filledIn: string // the filled-in-on-load marker
  runValue: string // how a row ran, its border and button (topic 7, "How it ran, in the tree")
  runFailed: string
  runFallback: string
  runCancelled: string
  runSkipped: string // never ran
  shorthandBorder: string // the dashed border (topic 3)
  fragmentBackground: string // a fragment with no colours of its own (topic 3)
  fragmentText: string
}
```

- **The defaults are in the editor's code,** merged under the host's values, which are compared by content, so an inline object costs nothing. The key list is settled when the components are built.
- **Operator and category colours are not here:** they are display data, in `operatorHints` and `categoryHints` ("Display overrides").
- **A dark mode is a different object,** swapped by the host as it swaps json-edit-react's `theme`. Do later: `editorTheme` values to pair with `@json-edit-react/themes`' dark themes.
- **How the values reach the editor's own components** (the DisplayBar, toolbar, messages area and hover cards) is as json-edit-react applies its theme: each component reads the merged values and sets them as inline styles on its own elements. The stylesheet holds none of them, and no custom properties are involved.

**Everything else is json-edit-react's `theme`,** layered over the editor's own theme layer: the editor passes `theme={[editorLayer, hostTheme]}`, so the host's layer wins wherever they overlap. The editor's styling that depends on a row's kind (brackets hidden on nodes, the node border, reference colours, the vars block) is written as style functions, which json-edit-react applies after every static style, so a host's static styles recolour json-edit-react's own elements without undoing the editor's structure. Reference colours come from `editorTheme`, not from `theme`'s `string`. This replaces v1's separate `styles` prop.

- Rejected: CSS custom properties that a host overrides in its own stylesheet. The tokens would be defined far from the component that uses them, and one part of the editor would be themed in CSS and the rest in props.
- Rejected: the tokens as json-edit-react theme `fragments`, so one `theme` object carries everything. Custom components cannot read a fragment by name (`getStyles` takes json-edit-react's own elements only), so it would need new json-edit-react API (J5 in [v3-upstream.md](v3-upstream.md), dropped).

**A standalone `./style.css`,** as json-edit-react publishes one. The editor injects its stylesheet into the document `<head>` on mount (plan, 1.6 and 2.1), which does not cross a Shadow DOM boundary, so the same text is also exported as `fig-tree-editor-react/style.css` for a host to inject into its shadow root, beside json-edit-react's own `style.css`. It costs an `exports` entry and a build step, checked by `scripts/entries.mjs` and `check:package`. The docs note that a Shadow DOM host needs both stylesheets. The colour defaults are not in it, since they are in code.

### Wording — **Agreed** for now

**The first build is English only, with the mechanism for translation decided.** When it is built, the editor's strings join json-edit-react's `translations` under a prefix of their own (`FT_TO_SHORTHAND: 'To shorthand'`, `FT_MESSAGES_ERRORS: '{{count}} errors'`), with json-edit-react's `{{placeholder}}` style, following the rule that a json-edit-react prop keeps its meaning, extended ("How the props relate to json-edit-react's"). Adding them is not a break. **The rule from the start:** every string the editor shows sits in one module, under the key it would have, so translation is later a lookup.

What it covers: the DisplayBar's and toolbar's labels, the pickers' group names, "Not valid here" and its reasons, the spelling-toggle hint, the modifier descriptions, the hover card's lines, the messages area's header, fixes and dismissals, the run's lines in the cards, collapsed summaries and the disabled-Evaluate reason. Operator and category names are display data, already replaceable through `operatorHints` and `categoryHints` ("Display overrides").

- **The hover card's generated lines** join lists ("one of 'test', 'extract' or 'match'") and describe types, which does not reduce to placeholders, so when translation is built they take a function hook of their own rather than a template.
- **`validate()`'s messages are fig-tree's,** in English, shown as they come (topic 7, "Where issues attach"), so a translated editor still shows them in English until fig-tree offers otherwise.
- Rejected for now: translations in the first build, work on text no host has asked to translate.
- Rejected: a separate `editorTranslations` prop, which makes a host translating the whole component fill in two objects where `translations` can hold both.

### Package exports — **Agreed**

| Kind    | From `fig-tree-editor-react`                                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Values  | `FigTreeEditor`; `Select`, the generic searchable dropdown, as in v1; `defaultEditorTheme`, as json-edit-react exports `defaultTheme`, for a host building a dark variant                                               |
| Types   | `FigTreeEditorProps`, `FigTreeEditorHandle`, `SetExpressionOptions`, `EditorStatus`, `EditorMessage`, `Evaluation`, `EvaluationFailure`, `EditorTheme`, `OperatorDefault`, `SlotType`, `Path`, and `Select`'s own types |
| Subpath | `./style.css` ("Theming and CSS")                                                                                                                                                                                       |

- **`Path` is the editor's own,** `(string | number)[]`. fig-tree has one internally but does not export it; the two are structurally the same, so nothing is needed upstream.
- **fig-tree is not re-exported,** as the Phase 2 skeleton already decided (plan, 2.1): it is a peer the host installs, and re-exporting it would make every fig-tree name part of the editor's API. For the migration note: Conforma imports `FigTreeEvaluator`, `EvaluatorNode`, `Fragment`, `FragmentMetadata`, `dequal`, `isFigTreeError` and `truncateString` from the editor through v1's `export *`; most are renamed in v3 (`FigTree`, `deepEqual`, `FragmentDefinition`), `truncateString` is gone, and all come from `fig-tree-evaluator`.
- **The editor's internals are not exported:** the fill-in step, the classification walk, the sub-tree expression builder, `displayPath`. Do later: the fill-in step as a pure function, if a host needs to normalise stored expressions outside the editor.

**`json-edit-react` becomes a peer dependency** (`^2.0.1`, the first release with J2, kept as a devDependency), as json-edit-react's own companion packages (`@json-edit-react/utils`, `/components`, `/themes`) take it. Plan 0.3 kept it a regular dependency because hosts did not touch it; since the props are json-edit-react's ("How the props relate to json-edit-react's"), hosts pass its props, want its types (`ThemeInput`, `NodeData`, `JsonEditorHandle`) and use its companions (`useUndo`, themes), each of which needs it installed anyway. As the editor's own dependency, a host could get two copies at different versions, with types from one that do not match the other. As a peer, the host lists `json-edit-react` in its own dependencies and nothing more: the editor imports it as usual, and the package manager resolves it to the host's copy (npm 7+ and pnpm also install a missing peer automatically). `@json-edit-react/utils` stays a regular dependency, since it takes json-edit-react as a peer and so shares the host's copy. `check:package`'s consumer installs it as a peer.

- Rejected: keeping it a dependency and re-exporting the json-edit-react types the props use. It saves the host one entry in `package.json`, but does not prevent a second copy for a host using the companions, and every json-edit-react type in the props becomes a name the editor re-exports.

### The props, together — **Summary**

Every prop the editor adds, from the sections above, beside json-edit-react's own (grouped in "How the props relate to json-edit-react's"):

```ts
interface FigTreeEditorProps extends Omit<
  JsonEditorProps,
  | 'data'
  | 'setData'
  | 'allowTypeSelection'
  | 'newKeyOptions'
  | 'defaultValue'
  | 'customNodeDefinitions'
> {
  figTree: FigTree
  expression: unknown
  setExpression: (expression: unknown, options?: SetExpressionOptions) => void // { autoUpdate?: boolean }
  onStatusChange?: (status: EditorStatus) => void
  messagesMaxHeight?: number | string // 0 hides the messages area
  editorRef?: React.Ref<FigTreeEditorHandle> // json-edit-react's handle, plus reveal({ path })
  evaluationData?: Record<string, unknown>
  onEvaluateStart?: (start: { path: Path }) => void
  onEvaluate?: (evaluation: Evaluation) => void
  defaultOperators?: OperatorDefault | Partial<Record<SlotType, OperatorDefault>>
  defaultFragment?: string
  operatorHints?: { [operator: string]: Partial<OperatorHints> }
  categoryHints?: { [category in OperatorCategory]?: Partial<CategoryHints> }
  editorTheme?: Partial<EditorTheme>
  referenceNames?: 'canonical' | 'alias' // $data or $d, wherever the editor writes a reference
}
```

Gone from v1: `objectData` (now `evaluationData`), `onEvaluateError` (`status: 'failed'`), `operatorDisplay` (`operatorHints`), `styles` (json-edit-react's `theme`), `defaultNewOperatorExpression` (`defaultOperators`), `defaultNewFragment` (`defaultFragment`), `defaultNewCustomOperator` and `addTopLevelFallback`. Do later: `customNodeDefinitions` from the host, `hiddenOperators` and `hiddenFragments`, an expected root type, `evaluate` on the handle, translations, and `isFragmentDefinition` (parked).
