# Node anatomy — what each kind is made of

_A companion to [v3-design.md](v3-design.md) ("Node model"). The design doc records the decisions; this file spells out, kind by kind, exactly how each node is built from json-edit-react's rows and the editor's own components, so it is always clear which part is ours and which is core json-edit-react. It describes the design agreed as the starting point for Phase 4, and changes with it. Its sketches are schematic: the DisplayBar's actual layout is in v3-design.md ("Header and toolbar")._

## How to read this

### Rows

json-edit-react (JER) renders a JSON value as a tree of **rows**, one per value, each identified by its **path**. An object or array is a **collection row**, and anything else is a **value row**. For

```js
{ total: { operator: 'plus', values: [1, 2] } }
```

the rows are `[]` (the root object), `['total']`, `['total', 'operator']`, `['total', 'values']`, `['total', 'values', 0]` and `['total', 'values', 1]`.

For every row, JER looks through `customNodeDefinitions` and applies the **first definition whose `condition` matches**. With no match, the row renders as plain JER.

### What JER draws for a row

**A collection row** has two parts, one above the other:

1. **The JER header row:** the collapse chevron, the key label (`total:`), the opening bracket, the item count (shown when collapsed), and the **edit tools** (✎ edit as raw JSON, ＋ add a key or item, ✕ delete, copy).
2. **The inner block:** the child rows, then the closing bracket.

When a definition gives the row a **custom component**, the component renders inside the inner block, and JER passes it the child rows as `children`, which it places wherever it likes. The JER header row stays above it unless the definition says `showCollectionWrapper: false`.

**A value row** is one line: the key label, then the value, then the edit tools. When a definition gives the row a custom component, the component replaces **only the value**; the key label and the edit tools are still JER's. While the value is being edited, JER shows its own input in place of the component (comment lines use `showOnEdit: false`; the reference definitions use `showOnEdit: true` and render the standard input they are passed, so that `editOnTypeSwitch` works, topic 4), plus its type dropdown.

### Terms

- **DisplayBar:** the editor's own header inside a node: the coloured Evaluate button showing the operator or fragment as written, the display name linked to its documentation, and the conversion buttons. On full nodes it also has the pencil that opens the **toolbar** (the node type switch, the operator or fragment picker, and "add parameter").
- **Filtered:** a child row that the node's component drops from its `children`, so it never appears. This is how the `operator` and `fragment` rows are removed.
- **Flattened payload:** a collection row with `showCollectionWrapper: false` and `showKey: false` and no component. JER then draws neither its header row nor its brackets: its child rows appear directly beneath whatever is above. It has no edit tools of its own.
- **Unlabelled:** a row whose definition is a copy of its usual one with `showKey: false`, so it renders exactly as usual minus its key label. Used on a shorthand's `$name` row when that row holds a single value.
- **Quoted:** inside a `literal` payload or a `//` value. No definition matches a quoted row, so everything there is plain JER.
- **Modifier styling:** the `//`, `fallback` and `noCache` keys are styled (the `vars` key takes the `$vars` colour instead) through the theme (a style function on the key), not through a custom definition. Styling and definitions are separate mechanisms in JER, so a `fallback` row can be any kind of row and still have its key marked as a modifier.

In the sketches, `✎ ＋ ✕` stands for JER's edit tools, `▾` for its chevron, and `▶` for an Evaluate affordance. The theme hides the brackets of node rows, as v1's does. JER's edit tools, the DisplayBar's pencil and the conversion buttons all appear on hover only; the sketches draw them permanently.

### Collapsed

A collapsed node shows only JER's header row, as in v1: the chevron, the key, and the brackets with a summary between them in place of the item count, such as `total: { Operator: plus }`, `greeting: { Fragment: greet }` or `label: { Shorthand: $if }`. A collapsed row with issues beneath it, plain collections included, colours its summary by the most severe of them, with a count where there is more than one ("Where issues attach" in the design). The summaries for each kind are sketched in section I of the mockups.

---

## 1. Operator, full

The standard way to create and edit an operator. Everything about it is editable in structured form.

```js
{ total: { operator: 'plus', values: [1, '$data.tax'], fallback: 0 } }
```

```
▾ total:                                        ✎ ＋ ✕
    [ plus ▶ ]  Addition            [To shorthand]  ✎
    values: [                                   ✎ ＋ ✕
      1                                         ✎ ✕
      $data.tax ▶                               ✎ ✕
    ]
    fallback: 0                                 ✎ ✕
```

**Row by row:**

- **`['total']`, the node itself.** A collection row with the **Operator** component.
  - JER draws the header row: chevron, `total:`, and the edit tools. Its ✎ opens the whole node as raw JSON; its ＋ adds a key by name.
  - Inside the inner block, the Operator component draws the DisplayBar, then the child rows it was given, minus the `operator` row.
- **`['total', 'operator']`.** Filtered. The DisplayBar shows the operator, and the toolbar is where it is changed.
- **`['total', 'values']`, a parameter.** Plain JER: a collection row with its own header, brackets and edit tools. A parameter row is not special in itself; its value is whatever it is.
  - `['total', 'values', 0]`, the `1`: plain JER.
  - `['total', 'values', 1]`, `$data.tax`: a **Reference** (kind 8).
- **`['total', 'fallback']`, a modifier.** A plain value row with modifier styling on its key.

**The two editors.** The node has one definition, with `showOnEdit: true`, so its component renders every edit session on the row, whichever button opened it. It keeps the requested editor in local state:

- **The DisplayBar's pencil** asks for the toolbar. The component keeps rendering, with the DisplayBar replaced by the toolbar and the child rows still beneath it.
- **The JER header row's ✎** opens the session without asking, so the component shows JER's raw-JSON editor in the inner block, composed into the component (J2 in [v3-upstream.md](v3-upstream.md)).

While either editor is open, JER hides the node's own edit tools, which is the known wart carried from v1, kept deliberately.

**Variants:**

- **Symbolic alias:** `{ operator: '+', values: [1, 2] }`. Identical, except the DisplayBar's button shows `+`. Switching between `plus` and `+` in the picker keeps the node as it is.
- **At the root or in an array:** `{ operator: 'plus', values: [1, 2] }` as the whole expression, or as an array element. Identical, except the JER header row has no key label.
- **With every modifier:** `{ '//': 'why', operator: 'http', url: '…', vars: { … }, fallback: null, noCache: true }`. The `//` row is a **Comment** (kind 11) and comes first, as the fill-in step places it first. `vars` is a **Vars block** (kind 12). `fallback` and `noCache` are plain rows with modifier styling. If `fallback`'s value is itself a node, that row is that kind of node, still with modifier styling on its key.
- **Broken:** `{ operator: 'flibble' }`, `{ operator: 42 }`, `{ operator: 'plus', fragment: 'x' }`. The same component and rows. The DisplayBar shows the name, or "invalid node", as an error with the issue's message. The toolbar still opens, so a valid operator can be picked. There is no Evaluate and no conversion, since the compiler and `./format` both refuse the node.

---

## 2. Fragment call, full

```js
{ greeting: { fragment: 'greet', parameters: { name: '$data.user', title: 'Dr' } } }
```

```
▾ greeting:                                     ✎ ＋ ✕
    [ greet ▶ ]  Greeting           [To shorthand]  ✎
    name: $data.user ▶                          ✎ ✕
    title: Dr                                   ✎ ✕
```

**Row by row:**

- **`['greeting']`, the node itself.** A collection row with the **Fragment** component, and the same two editors as an operator.
  - JER draws the header row.
  - Inside the inner block, the Fragment component draws the DisplayBar, then its child rows minus the `fragment` row. Its colours and display name come from the `FragmentHints` in the fragment's `metadata`.
- **`['greeting', 'fragment']`.** Filtered.
- **`['greeting', 'parameters']`.** A flattened payload. It has no header, brackets or edit tools of its own, so the arguments appear directly beneath the DisplayBar, where an operator's parameters would be.
  - `['greeting', 'parameters', 'name']`: a **Reference**.
  - `['greeting', 'parameters', 'title']`: plain JER.

The toolbar's "add parameter" offers the fragment's declared parameters and writes them into `parameters`, creating it if absent. Each argument row has its own ✎ and ✕.

One visual consequence: a modifier such as `fallback` sits beside `parameters` in the data, not inside it, but on screen it appears at the same level as the arguments. Modifier styling is what tells them apart.

**Variants:**

- **No arguments:** `{ fragment: 'greet' }`. There is no `parameters` row, so the node is just the DisplayBar.
- **Dynamic arguments from a reference:** `{ fragment: 'greet', parameters: '$data.formValues' }`.
  - The `parameters` row is **not** flattened. It is a **Reference** row with its key shown, because it is one expression that computes the whole arguments object, not a list of arguments.
  - "Add parameter" offers the modifiers only, with no arguments, and "To shorthand" is not offered, since this call has no shorthand form.
- **Dynamic arguments from a node:** `{ fragment: 'greet', parameters: { $buildObject: [ … ] } }`. As above, but the `parameters` row is that node's own kind (here a shorthand node, kind 5) with its key shown.
- **Broken:** `{ fragment: 'nope' }`. As for operators: the name is shown as an error, and the toolbar opens so a registered fragment can be picked.

---

## 3. Shorthand, named (operator)

A representation, not an editing form. The values inside are editable as what they are, but the node itself cannot be switched to another operator without converting it to full form first.

```js
{ label: { $if: { condition: '$data.isMember', then: 'Welcome back', else: 'Sign up' } } }
```

```
▾ label:                                        ✎ ＋ ✕
    [ $if ▶ ]  Conditional (?)   [To positional]
    condition: $data.isMember ▶                 ✎ ✕
    then: Welcome back                          ✎ ✕
    else: Sign up                               ✎ ✕
```

**Row by row:**

- **`['label']`, the node itself.** A collection row with the **Shorthand** component.
  - JER draws the header row. Its ✎ opens the node as raw JSON; its ＋ adds a key to the node object itself, which is where a sibling `fallback` or `//` goes.
  - Inside the inner block, the Shorthand component draws the DisplayBar, then the child rows. The DisplayBar has no pencil and no toolbar. It shows the `$if` button in italics and one conversion button, which steps through the forms: "To positional" here, since the node is named; "To full" on a positional node; and "To full" on a node with no positional form, such as a fragment call.
- **`['label', '$if']`, the payload.** A flattened payload, so the parameters appear directly beneath the DisplayBar, as they would on a full node. Having no edit tools of its own, it offers no ＋, so adding a parameter means converting to full form. Each parameter row keeps its own ✎ and ✕, and its type dropdown is filtered by the parameter's declared type, looked up by its key.
  - `['label', '$if', 'condition']`: a **Reference**.
  - `['label', '$if', 'then']` and `['label', '$if', 'else']`: plain JER.

Nothing is filtered here: the `$if` row is flattened rather than removed, because its children are the parameters.

**Variants:**

- **With sibling modifiers:** `{ $if: { … }, fallback: 'n/a' }`. The `fallback` row is a child of the node object, a sibling of the `$if` row, so it renders after the flattened parameters, with modifier styling.
- **With a comment inside the payload:** `{ $if: { '//': 'why', condition: … } }`. This only comes from hand-written JSON, since the editor puts comments on the node. The `//` row is a **Comment** among the parameters, and "To full" moves it onto the node, as `./format` does.
- **Symbolic alias:** `{ '$?': { condition: …, then: … } }`. The button shows `$?`.

---

## 4. Shorthand, named (fragment)

```js
{ greeting: { $greet: { name: '$data.user', title: 'Dr' } } }
```

```
▾ greeting:                                     ✎ ＋ ✕
    [ $greet ▶ ]  Greeting                  [To full]
    name: $data.user ▶                          ✎ ✕
    title: Dr                                   ✎ ✕
```

The structure is exactly that of kind 3, with the **Shorthand** component on `['greeting']` and a flattened payload on `['greeting', '$greet']`. The differences:

- **Display data** comes from the fragment's `FragmentHints`.
- **There is no positional/named toggle,** since fragments are named only.
- **Argument rows' type dropdowns** are filtered by the fragment's parameter declarations.

**Variants:**

- **No arguments:** `{ $greet: {} }`. The flattened payload has no children, so the node is just the DisplayBar.
- **Dynamic arguments:** `{ $greet: { $buildObject: [ … ] } }`. The payload is itself a node, so the `$greet` row is **not** flattened: it is an unlabelled node row (here a positional shorthand, kind 5). Flattening it would remove that inner node's own header.
- **Broken:** `{ $greet: '$data.x' }`, since a fragment's shorthand payload must be an object (`malformed-node` at the `$greet` row). The Shorthand component shows the error. There is no Evaluate or conversion, and the fix is made through raw JSON.

---

## 5. Shorthand, positional

The most compact form, and the one "To shorthand" produces wherever it is allowed. The payload is either an array of arguments or a single value.

### With an array payload

```js
{
  sum: {
    $plus: [1, '$data.tax']
  }
}
```

```
▾ sum:                                          ✎ ＋ ✕
    [ $plus ▶ ]  Plus (+)      [To full]
    ▾ [                                         ✎ ＋ ✕
        1                                       ✎ ✕
        $data.tax ▶                             ✎ ✕
      ]
```

- **`['sum']`:** a collection row with the **Shorthand** component, as in kind 3.
- **`['sum', '$plus']`:** the argument array, **unlabelled**, not flattened. It is still one value, the argument list, so it keeps its chevron, brackets and edit tools, minus the `$plus:` key label.
  - Its ＋ adds an element, seeded for the parameter it would bind, only where the operator has a rest parameter or an unfilled optional trailing position.
  - Its ✕ is hidden: deleting the payload would leave `{}`, so the node is deleted from its own row.
  - `['sum', '$plus', 0]`: plain JER.
  - `['sum', '$plus', 1]`: a **Reference**.

The elements have no labels, since array indexes are hidden throughout the editor. Their type dropdowns are filtered by the parameter each position binds to, which the editor works out from the operator's `positionalParams`.

It would help to show, dimmed, the parameter each position binds (`condition`, `then`, `else` for `$if`). JER's key slot cannot do it: it is never drawn for array elements while array indexes are hidden, so a `keyComponent` has nowhere to render. It would need either a component on every element row, or a JER option for labelling individual array elements. Do later, with J7 in v3-upstream.md.

### With a single value

The `$name` row holds one value rather than a list, so it is **unlabelled**: it renders as that value's own kind, without the `$not:` label. A plain value or a reference sits **on the same line as the Evaluate button**, as in v1, since the point of the form is to be concise: the Shorthand component places that child row beside the button rather than beneath it. The row is still JER's own value row, with its edit tools.

- **A plain value:** `{ $not: true }`. `['x', '$not']` is a plain JER value row, unlabelled.

  ```
  ▾ x:                                          ✎ ＋ ✕
      [ $not ▶ ]  true  ✎ ✕          Logical NOT (!)  [To full]
  ```

- **A reference:** `{ $not: '$data.disabled' }`. `['x', '$not']` is a **Reference** row, unlabelled.

  ```
      [ $not ▶ ]  $data.disabled ▶  ✎ ✕   Logical NOT (!)  [To full]
  ```

- **A reference to a whole list:** `{ $min: '$data.scores' }`. The same structure, but the single value binds to `min`'s rest parameter as a whole, so it is "the list of values", not the first of several.
- **A node:** `{ $not: { $greaterThan: ['$data.age', 18] } }`. `['x', '$not']` is a **Shorthand** node row, unlabelled. It is a collection row spanning several lines, so it goes beneath the button, not beside it. It keeps its JER header row (chevron and edit tools) without a key label, then its own DisplayBar and argument array.

  ```
      [ $not ▶ ]  Logical NOT (!)            [To full]
      ▾                                         ✎ ＋ ✕
          [ $greaterThan ▶ ]  Greater than (>)  [To full]
          ▾ [ … ]
  ```

### Other variants

- **With sibling modifiers:** `{ $http: 'https://api.example.com/rates', fallback: null }`. The `$http` row is an unlabelled plain value row holding the URL, and the `fallback` row follows with modifier styling.
- **Symbolic alias:** `{ '$+': [1, 2] }`. The button shows `$+`.
- **Broken:** a non-reserved sibling (`{ $plus: [1], extra: 2 }`) or two `$name` keys (`{ $plus: 1, $minus: 2 }`), each `malformed-node` at the offending key. The Shorthand component shows the error. There is no Evaluate or conversion, and the fix is made through raw JSON. Too few arguments (`{ $if: ['$data.x'] }`) is not broken: it is `missing-required` on a well-formed node, which flags its header and still converts.

---

## 6. Literal, full

`literal` is grammar rather than an operator, so it has no `getOperators()` entry. Its display name and colours come from its entry in `./editor-hints`, and the editor supplies its description.

```js
{ template: { operator: 'literal', value: { $plus: [1, 2] } } }
```

```
▾ template:                                     ✎ ＋ ✕
    [ literal ▶ ]  Literal (quoted)   [To shorthand]  ✎
    value: {                                    ✎ ＋ ✕
      $plus: [                                  ✎ ＋ ✕
        1                                       ✎ ✕
        2                                       ✎ ✕
      ]
    }
```

- **`['template']`:** a collection row with the **Operator** component, since a literal is an operator node in every way but its content: the DisplayBar, and both editors. The operator picker lists `literal` explicitly, and choosing it on another node quotes that node.
- **`['template', 'operator']`:** filtered.
- **`['template', 'value']` and everything beneath it:** quoted, so plain JER throughout. The `$plus` here is data, not a node: no DisplayBar, no Evaluate, no reference styling. Its type dropdown offers every type.

Evaluating it returns the content unchanged.

---

## 7. Literal, shorthand

```js
{
  template: {
    $literal: {
      $plus: [1, 2]
    }
  }
}
```

```
▾ template:                                     ✎ ＋ ✕
    [ $literal ▶ ]  Literal (quoted)            [To full]
    ▾ {                                         ✎ ＋ ✕
        $plus: [                                ✎ ＋ ✕
          1                                     ✎ ✕
          2                                     ✎ ✕
        ]
      }
```

- **`['template']`:** a collection row with the **Shorthand** component, as any shorthand node has. It has no pencil, and its conversion goes between the two forms only.
- **`['template', '$literal']`:** the content, quoted. This row is **unlabelled rather than flattened**, even when the content is a collection. A literal's content is one value, not a list of parameters. Flattening it would show `{ a: 1, b: 2 }`'s keys as if they were the node's parameters, and would take away the content's own edit tools, which are how quoted data gets edited. Unlabelled, the content keeps its chevron, brackets and ＋, and reads as the single quoted value it is.

A primitive, `{ $literal: 'x' }`, is an unlabelled plain value row either way.

---

## 8. Bare reference

A string leaf, in any of the five namespaces, and always a value row.

```js
{
  name: '$data.user.name'
}
```

```
name: $data.user.name ▶                       ✎ ✕ [→ get]
```

- **`['name']`:** a value row with the **Reference** component.
  - JER draws the key label (`name:`) and the edit tools.
  - The component replaces only the value: the string in its namespace's colour, and a small inline Evaluate affordance. Each namespace has its own colour: `$data`, `$vars`, `$params`, and the iterator bindings (`$element`, `$index` and `as` names).
  - "To get node" is a JER custom button on reference rows, so it appears on hover with the other edit tools.
  - On ✎, the component renders JER's ordinary string input, which it is passed (`passOriginalNode`), with the type dropdown (filtered by the parameter's type, where the reference is a parameter). So a reference is edited by typing, like any string.

**Variants:**

- **Short and bare forms:** `'$d.user.name'`, `'$data'`. The same.
- **Scoped namespaces:** `'$vars.country[0].name'`, `'$element.name'`, `'$index'`, `'$order.id'` (an `as` binding). The same structure. Evaluate needs the ancestor scope ("Sub-tree evaluation" in the design doc). `$index` has no `get` form, so "To get node" is not offered on it.
- **As an array element:** `['$data.a', 2]`. No key label, since array indexes are hidden.
- **As a single-value payload:** `{ $not: '$data.x' }`. Unlabelled (kind 5).
- **As dynamic fragment arguments:** `parameters: '$data.form'` (kind 2).
- **Unresolved:** `'$vars.nope'`, or `'$element'` outside an iterator. The same structure, with its diagnostic and no Evaluate.
- **Not references at all:** `'$dat.x'`, `'$database'`, `'Hi {{$data.name}}'`, or any reference-shaped string inside quoted content. These are plain strings (the first two carry a warning).

---

## 9. Plain container with holes

A plain object or array that is not a node itself but contains nodes or references, so it is evaluable as a whole.

```js
{ title: '$data.name', total: { $plus: [1, 2] } }
```

```
▾                                               ✎ ＋ ✕
    [ Evaluate ▶ ]
    title: $data.name ▶                         ✎ ✕
    ▾ total:                                    ✎ ＋ ✕
        [ $plus ▶ ]  Plus (+)   [To full]
        1                                       ✎ ✕
        2                                       ✎ ✕
```

- **The container row:** a collection row with the **Container** component. JER draws the header row, and the component draws a bare Evaluate button (no toolbar, no conversions), then the child rows unchanged.
- **The child rows:** whatever they are.

It applies to arrays the same way (`['$data.a', { $plus: [1, 2] }]`). Only the root container gets the button, for now (topic 3).

---

## 10. Plain data

Anything that is not a node, not a reference and holds none: `{ a: 1 }`, `[1, 2]`, `'hello'`, and `{ $typo: 1 }` (an unrecognised `$` key, which carries an error but is data). No definition matches, so it is plain JER throughout. Everything quoted is plain data too, whatever it looks like.

---

## 11. Comment

The `//` key, legal on any object. Its value is never evaluated.

```js
{ '//': 'Rate falls back to 1.0 if the API is down', operator: 'http', url: '…', fallback: 1 }
```

```
▾ rate:                                         ✎ ＋ ✕
    [ http ▶ ]  HTTP request        [To shorthand]  ✎
    ✎ Rate falls back to 1.0 if the API is down ✎ ✕
    url: …                                      ✎ ✕
    fallback: 1                                 ✎ ✕
```

- **`['rate', '//']`:** a value row with the **Comment line** component and `showKey: false`, so there is no `//:` label. The component renders the text, unquoted and untruncated, as a note belonging to the node. JER's edit tools appear on hover, as on any row, and on ✎ its string input appears.
- The fill-in step places `//` first among the node's keys, so the note sits directly under the DisplayBar.

**Variants:**

- **Several lines:** `'//': ['First line', 'Second line']`. A plain JER array, with `showKey: false` and no component. Its header row keeps only the edit tools (its ＋ adds a line, its ✕ deletes the comment), the theme hides its chevron and brackets and styles the whole array as one note block, and each line is a **Comment line** value row, edited in JER's own input. It never starts collapsed.
- **Another value** (`'//': { ticket: 123 }`): plain JER data, with modifier styling on the `//` key and no note style.
- **On a plain object, or inside `vars` or `parameters`:** the same.
- **Inside quoted content:** plain data.

---

## 12. Vars block

The `vars` key on an operator node, a fragment call, a shorthand node (as a sibling of the `$name` key) or a plain object.

```js
{ operator: 'if', …, fallback: null, vars: { country: { $http: 'https://…' }, limit: 5 } }
```

```
    condition: …                                ✎ ✕
    fallback: null                              ✎ ✕
  ┃ ▾ vars:                                     ✎ ＋ ✕
  ┃     country:                                ✎ ＋ ✕
  ┃       [ $http ▶ ]  https://…    HTTP request  [To full]
  ┃     limit: 5                                ✎ ✕
```

- **`['…', 'vars']`:** a plain JER collection row, with no definition of its own. The theme styles it: the `vars` key takes the colour of `$vars` references, and the block gets a left rule and a tinted background, set slightly apart from the rows above it. JER draws the header row and its edit tools as usual, and the collapsed summary (`{ 2 vars }`) comes from `customText`. The block comes **last** among the node's rows (the fill-in step orders keys: `//`, the parameters, `fallback` and `noCache`, then `vars`). On a plain object it stays where it was written.
- **The child rows:** plain JER rows on the block's tint. Each key is a var name, and each value is classified as usual: here a shorthand node and a plain number. A key must follow the name-legality rule (no `.`, `[`, `]`, no leading `$`), which the diagnostics report.

The block's ＋ asks for a name, and the new var starts as `'Replace me'`, closed ("The vars block" in the design doc).

---

## 13. `fallback` and `noCache`

Neither is a kind of its own. They are ordinary rows with modifier styling on the key.

- **`fallback`:** its value is an expression, so the row is whatever that value is: a plain value, a reference or a node of any kind.
- **`noCache`:** always `true`, so a plain value row whose type dropdown offers only boolean. It is legal on operator nodes and fragment calls, and turns caching off for everything inside the node.
