# fig-tree-editor-react — fragment editor design

_Working document for authoring and editing fragment definitions with the editor ([#16](https://github.com/CarlosNZ/fig-tree-editor-react/issues/16)). It takes over "Fragment-definition mode" (topic 6 of [v3-design.md](v3-design.md)), which was parked there, and uses the same section states: **Agreed** sections are settled, **Proposed** ones are drafted and awaiting a decision, **Open** ones are still being thought through, and **Findings** record what an upstream package does, checked against it._

---

## Starting point — **Findings**

The expression editor is already most of a fragment editor: a fragment body is an ordinary expression. What it lacks is:

- `$params` references in the tree;
- values for those parameters, so the body can be evaluated;
- the rest of the definition: the parameter declarations, the description and the display metadata.

**What Conforma does.** The body is edited in the expression editor. Beside it, a separate JSON editor holds test parameters, and an "Evaluate with params" button evaluates the body as a call to the fragment with those arguments would.

**What fig-tree does with a body today** (3.0.0-preview.12):

- `validate()` reports every `$params` reference as `unresolved-param`, declared or not. The static checker can resolve them against declared names (`runStaticChecks(artifact, { fragmentParams })`), but only registration passes the names.
- `evaluate()` refuses `$params` with the same error.
- Registration's other checks (the wrapper's strict shape, defaults type-checked against their type, `required` with a `default`, name legality) run only in `new FigTree()` and `updateOptions()`. The editor cannot run them on a scratch instance, since an instance never returns its operator definitions.
- `getFragments()`' `dependencies.fragments` is transitive, so the fragments whose use would close a cycle can be found with no upstream change.
- A trace entry inside a fragment body carries `source: { fragment }` and its path within the body.
- A declared parameter that the body never reads is not reported. Nothing in fig-tree warns about it.

---

## Components and data flow — **Agreed**

**Separate components, placed by the host.** The fragment editor is not one layout. The host places each part where it likes:

- the expression editor, `FigTreeEditor`, in fragment mode, editing the body;
- a definition editor, a json-edit-react editor configured for the rest of the definition (parameter declarations, description, metadata and sample values).

The sample values start inside the definition editor, since they live in the definition ("The definition's shape"). They move to a component of their own only if the definition editor turns out too cluttered.

**One piece of state.** One `FragmentDefinition` is held, by `useFragmentEditor` on the host's behalf ("Authoring state"). The expression editor edits its `expression` and adds declarations ("Parameters"); the definition editor edits the rest. Both are controlled, so they cannot drift apart: they are two views of the same object.

**Fragment mode is switched on explicitly** by the host, as agreed in v3-design.md (topic 6), rather than inferred. In that mode the expression editor needs the whole definition, since it writes declarations, and, once the fragment is registered, its name, for cycles ("The fragment picker").

### The props — **Proposed**

```tsx
<FigTreeEditor
  figTree={figTree}
  fragmentDefinition={definition}
  setFragmentDefinition={setDefinition}
  fragmentName="getCapital" // optional
  evaluationData={data} // $data in a body, as in any expression
  // ...
/>
<FragmentDefinitionEditor
  figTree={figTree}
  definition={definition}
  setDefinition={setDefinition}
  fragmentName="getCapital" // optional, as above
  setFragmentName={setName} // optional; without it the name can't be changed here
/>
```

**The editor takes an expression or a fragment definition, never both.** The props type is a union: `expression` with `setExpression`, or `fragmentDefinition` with `setFragmentDefinition`. Passing `fragmentDefinition` is what switches fragment mode on. `setFragmentDefinition` takes the same `SetExpressionOptions` as `setExpression` (`autoUpdate`), so a host keeping history can record an automatic update in place.

**Why the whole definition, not the body.** Adding a declaration for a new reference changes the body and the declarations in one edit, so it reaches the host as one update: one step in a host's history, and never a body that references an undeclared parameter. Rejected: keeping `expression` and `setExpression` for the body and adding the declarations with a setter of their own, which turns that edit into two updates and has the host split the definition and put it back together.

**Separate props, not one object,** as `expression` and `setExpression` are, so nothing in the editor depends on the identity of an object the host builds on each render.

**The name is a prop of its own,** since `FragmentDefinition` has no `name`: a fragment is named by its key where it is registered, and registration rejects unknown keys on the definition. It is optional. A fragment not yet registered cannot be called by any other, so there is no cycle for the picker to prevent, and evaluating through a call can use a temporary name. It is held with the definition ("Authoring state") and passed to both editors: the definition editor is where it is changed ("The definition editor").

---

## The definition's shape — **Agreed**

```ts
interface FragmentDefinition {
  expression: unknown
  parameters?: {
    [name: string]: {
      type?: ExpectedType
      required?: boolean // defaults to true unless there's a default
      default?: unknown // a constant, type-checked at registration
      description?: string
      constraints?: Constraints
      metadata?: Record<string, unknown> // opaque
    }
  }
  description?: string
  samples?: { [parameter: string]: unknown }
  metadata?: FragmentMetadata
}

interface FragmentMetadata {
  displayName?: string
  docUrl?: string
  backgroundColor?: string // a pair with textColor
  textColor?: string
  seeds?: { [parameter: string]: unknown }
}
```

**`FragmentMetadata`** is fig-tree's `FragmentListing` renamed: the definition's `metadata` _is_ the fragment's display metadata, by convention, and `getCatalog` reads it as such. The engine never reads it.

**`samples` sits at the root of the definition,** not in `metadata`: sample values are part of authoring and testing the fragment, not of how it is presented. They are keyed by parameter name, as `seeds` is.

**Registration type-checks `samples`** against the declarations, as it does `default`s (F20 in [v3-upstream.md](v3-upstream.md)), so a sample a call would reject is reported where it is written, not at every ▶. The call to a draft checks every sample, read or not.

**`samples` and `seeds` are different things.** A seed is what a new call starts with, often an empty value (`""`); a sample is a realistic value to test the body with (`"NZ"`). They are kept apart.

**Each parameter's `metadata` stays opaque.** Nothing needs a convention for it yet.

**`description` stays at the root of the definition,** not in `metadata`, though the engine never reads it and an operator's description is in its listing. Each parameter's description belongs in its declaration, beside the type and `required` it explains, not in a map keyed by name that would have to follow a renamed parameter as `samples` and `seeds` do. The fragment's own description sits at the root of the definition in the same way.

The changes are fig-tree's: the rename, `samples` among the wrapper's allowed keys, and their type check ("Upstream changes").

### Open

- Should `getFragments()` or `getCatalog` report `samples`? The definition editor gets the definition from `useFragmentEditor`, which keeps the definitions, so it does not need them to.
- A declared `returns`, which registration would check against the inferred one. Inference covers the editor's needs, so this can wait.

---

## Parameters — **Agreed**

**A reference creates its declaration.** When an edit in the expression editor commits `$params.country` and `country` is not declared, the editor adds a declaration for `country`. With no default, it is required, and it gets a sample ("The definition editor"). The same applies to a template token (`{{$params.country}}`). A drill (`$params.country.code`) declares its first key. A `get` with a computed path declares nothing. The names come from `getDependencies()`' `params` entry (Upstream changes).

**Its type is what the reference's position admits** (the slot's `admits`), so `$params.country` typed into `plus.values` is declared `['number', 'string']`, and one typed into `if.condition` what `condition` admits. Where the position says nothing about the parameter's own value, the type is `any`: a drill, whose position admits the drilled value; a template token, whose value is turned into text; a `get`, unless its path is the parameter alone; and plain data. Where one edit adds the same new name at several positions (a pasted body), they must all agree on a type, otherwise it is `any`. A parameter added by hand in the definition editor also starts as `any`. An existing declaration's type is never changed.

**Nothing removes a declaration on its own.** When the last reference to a parameter goes, its declaration stays, flagged as unused in the definition editor, with a quick fix to remove it (and its `samples` and `metadata.seeds` entries). fig-tree has no such warning, so the editor works it out from the names `getDependencies()` finds the body reading. Where the body's reads can't be listed (a bare `$params`, or a computed path from it), it may read any parameter, so none is flagged.

**A typo is visible, not silent.** `$params.contry` adds a second declaration beside `country`, which becomes unused, so both show in the definition editor.

**Renaming is done on the declaration,** and rewrites the body's references to it, through F8 (the rename helper in [v3-upstream.md](v3-upstream.md)). Retyping a reference in the body only adds a new declaration. Renaming or removing a parameter also renames or removes its entries in `samples` and `metadata.seeds`.

**A declaration is added on an edit in the expression editor,** not as a standing rule, and in the same write as the edit. The edit declares the parameters it brings into the body: those read after it and not before. A reference left undeclared some other way (its declaration removed or renamed in the definition editor, or a body the host changed) is an `unresolved-param` error, with a quick fix to declare it, typed as an edit's would be. The issue names the parameter (F21 in [v3-upstream.md](v3-upstream.md)). As a standing rule, removing a declaration still in use would put it straight back.

**Removing a declaration still in use is allowed,** leaving those errors. Refusing it would need the definition editor to walk the body, and renaming its key leaves references behind in the same way. Until F8, the quick fix after a rename declares the old name again, so the references are renamed by hand.

**Why a mix of the two directions.** Declarations alone as the source of truth makes the author declare each parameter before using it. The body alone as the source of truth turns every typo into a parameter, and loses a declaration's type, description and default the moment its last reference goes. The mix keeps the "type it and it exists" flow while never losing a declaration.

### In the expression editor

- **The Parameter entry** in the type dropdown is offered in fragment mode only, after Data, wherever Data is. It starts as the first declared parameter, its name selected, or as `$params.` with the name to type when none is declared yet. It is spelt by `referenceNames` (`$params` or `$p`), and coloured with the `$params` token (magenta). The name is typed freely: a typo is declared beside the name it misspells, which shows as unused.
- **Everything that handles a reference handles `$params`,** checked against fig-tree: template tokens (validated with the declared names, found by `getDependencies()`, and left as written by the conversions, as every namespace's are), `get` with `from: '$params'` (a bare `$params` is a value, so it has a ▶), the to-get-node button (`{ path: 'country', from: '$params' }`), the conversions (`$params` and `$p` respelt by `referenceNames`), and the ▶ on reference rows (a call to the draft). None needed a change.
- **Later:** autocomplete after `$params.`, listing the declared parameters, if typing the names turns out to be a nuisance. json-edit-react's input gives a component its live text, so it needs no upstream change.

---

## The fragment picker — **Agreed**

In fragment mode the picker never offers the fragment being defined, or any fragment whose `dependencies.fragments` includes it, since using either would close a cycle. This needs the fragment's name (`fragmentName`), and no upstream change. Without a name, nothing is left out: a fragment not yet registered cannot be called by any other. So this matters only while a registered fragment is being edited.

They are left out, not dimmed, since they can never be used in this body, and not only from the picker: from everything that offers a fragment (the type dropdown's Fragment entry, the node-type switch, the starting fragment, and the "Change to" fix on an unknown fragment). A call already in the body keeps its fragment in the picker, as the current one.

The editor goes no further than the expression editor in catching cycles. A call that closes one and arrives some other way (pasted, or in the raw-JSON editor) isn't reported: it fails at registration, as it would anywhere else. Until then, a ▶ runs the draft under its temporary name, so the call reaches the registered version, once.

---

## Evaluation — **Agreed**

**Through a call.** The editor already evaluates fragment bodies whenever an expression calls one. So the body, or a sub-tree of it, is evaluated as a call: `{ fragment: name, parameters: samples }`. That gives the behaviour of a real call for free: defaults applied, `null` treated as unset, and the arguments checked against the declarations. A required parameter with no sample would fail every row's call alike, whether the row reads it or not, so the editor refuses the ▶ before the call, naming the parameters without samples. A failure's message names the fragment by `fragmentName`, or `draft` without one, never by the temporary name. A ▶ on an inner row wraps that sub-tree as a temporary fragment with the same declarations, with the scope around it wrapped as `subTree.ts` does in expression mode.

**On a derived instance.** The draft is registered on an instance derived from the host's, `figTree.with({ fragments: { [name]: draft } })` (F19 in [v3-upstream.md](v3-upstream.md)), and the call is evaluated there. `with()` builds a new instance as if `updateOptions()` had been applied to a copy, so the host's instance is untouched. It has a result store of its own, so nothing one instance does reaches the other's. One is derived for each ▶, so it is never out of date.

Results are reused from one ▶ to the next only where the host's instance names a `store` in its `cache` options. The derived instance's result cache is its own, but built from the same options, so a host store is shared by both, as it is between any two instances over one store (checked in the demo, whose instance has one). Within one evaluation, caching works as usual. Without a host store, each ▶ starts with an empty one, so every cached request in the draft (an `http` or `sql` node) runs again on every press, where in expression mode it would be read from the store until it expired. If that matters, the editor can keep the derived instance and derive a new one only when the fragment it registered (the body, or the ▶'s sub-tree, and the declarations) or the host's instance has changed.

**Under a temporary name.** Registering the draft under its own name would check every registered fragment that calls it against the draft's declarations, so a caller elsewhere in the registry could refuse the draft. Under a temporary name, a draft that reaches its registered version through another fragment runs that version. Cycles are the fragment picker's to prevent ("The fragment picker").

**A draft that doesn't register** throws from `with()`, with every issue at its path. The ▶ reports it as a refused evaluation, as `evaluateSubTree` does a refusal in expression mode. Its errors are already in the tree, from validation.

**The trace.** Each body node's entry carries `source: { fragment }` and its path in the definition. Registration compiles a body under `['expression']`, so that key comes off to give the row (checked against fig-tree). The call itself is the root entry, at `[]`, and each argument has an entry at `['parameters', name]`, with no `source`: these stand for nothing in the tree. `readTrace` in `runMarks.ts` reads the draft's entries by their paths, and lets each call to another fragment stand in for that body's entries, as it does now. The `Evaluation` a host receives carries the draft's temporary name as `draft`, so it can tell the tree's entries from the rest.

**Failures.** Once a failure has left a fragment body, fig-tree gives where in the body it failed as `fragment` and `fragmentPath`, and keeps its `path` at the call, in the coordinates of the body that made it (checked against fig-tree). A failure in the draft has the draft's name and its row as `fragmentPath`, so it is the tree's own, without a `fragment`. One in a fragment the draft calls, at any depth, has its `path` at the call in the draft's body, and keeps its `fragment`, as in expression mode. One with neither, such as a sample a required parameter lacks, is at the call, so it marks the evaluated row.

**Rejected:**

- `updateOptions()` on the host's instance, which changes the host's state and checks the registry's callers against the draft.
- A second instance the host builds for drafts, which needs the host's operator definitions passed in as well as the instance.
- `getOptions({ full: true })`, so the editor could build the second instance itself. It would be the one method to hand out operator implementations and fragment bodies, which fig-tree withholds everywhere else.
- Substituting the samples for the body's `$params` references, then evaluating it as an expression. The walk would copy fig-tree's reference grammar (`$p`, drills, bare `$params`, template tokens, `get` from `$params` with a computed path), wrap every value in `literal` so a sample isn't read as an expression, and copy a call's defaults and argument checks.

Evaluating through a call makes F10, an `evaluate()` option for `$params` values, unnecessary.

---

## Validation — **Agreed**

**The body, through `validate()` with the declared names** (F9 in [v3-upstream.md](v3-upstream.md)): `validate(body, { params, data })`, on each edit, as an expression is validated now. Registration and `validate()` run the same static checks. The one difference is that registration passes the declared names (`runStaticChecks(artifact, { fragmentParams })`), so `$params` references resolve against them, while `validate()` passes nothing, so each one is `unresolved-param`. The checks read only the names, not the declared types. So with the names, `validate()` checks a body as registration does, and it also gives what registration can't: `missing-data-path` against the sample data at body paths, and the body's warnings, which registration keeps for `getFragments()` and a calling expression's `validate()` never repeats. Every issue is at its path in the body, so the tree shows it as it shows an expression's, and a ▶ is blocked only by errors a real call would refuse on.

**The declarations, through registration.** `validate()` can't check the declarations themselves (their shape, defaults against their types, `required` with a `default`). Registering the draft on a derived instance, `figTree.with()` under a temporary name as in "Evaluation", does, and throws them with every issue at its path, such as `['fragments', name, 'parameters', 'x', 'default']`. The definition editor shows each at its path in the definition (`['parameters', 'x', 'default']`). Registration's issues inside `expression` are left out, since `validate()` already reports the body's.

**On each edit, to start with.** Each `with()` checks the whole registry again. A host's registry is likely small enough that this doesn't matter. If it is slow, the check runs only when something outside `expression` changes, since that is where the issues it adds are.

---

## The definition editor — **Proposed**

- A json-edit-react editor held to the definition's shape: the keys it allows, at each level, are the shape's, and `expression` is not shown.
- It edits the parameter declarations, `description`, `samples`, and `metadata` (display name, documentation link, colours as a pair, seeds), since these are how the fragment appears where it is called.
- The sample values are keyed by the declared parameters only. An optional parameter left without one is unset.
- **A new required parameter gets a sample,** its starting value, as a new `samples` field gives each required parameter, unless it has one already. This holds however it is declared: by hand, by an edit in the expression editor, by the quick fix, or in a definition pasted or edited as JSON, where `samples` is added if it isn't there. A declaration starts required, so a parameter just declared has a sample, and a ▶ isn't refused for want of one. A parameter declared optional gets none, so it stays unset, and a sample is never removed or changed when its declaration's type or `required` changes later.
- **Its own components,** from `@json-edit-react/components`: a colour picker for `backgroundColor` and `textColor`, without opacity, and chips for `type`.
- **A declaration's `type` has three entries in the type selector,** one for each form it takes: **Single**, a basic type picked from a list (an enum); **Multiple**, a union shown as chips picked from the basic types, `any` left out since a union with it is `any`; and **Literal**, a literal union of strings shown as chips typed freely. Switching from Single to Multiple keeps the type as the union's one member. A switch to Single takes the list's first type (`any`), since json-edit-react's switch to an enum reads the value before the definition's `toStandardType`; with that changed, it would keep the union's first member, or `string` from a literal union.
- **Its root row is a preview of a call's header,** in place of the root's name: the fragment's button as a call to it shows in the expression editor, labelled with the fragment's name in its colours, with its display name at the top right. A click on the button turns it into an input that renames the fragment: Enter or leaving it saves, Escape cancels, and clearing it leaves the fragment unnamed, unless it is registered ("Authoring state", "A rename saves at once"). An unnamed fragment's button says "Fragment — click to rename". The button has no ▶, since nothing runs from it. It is json-edit-react's `keyComponent` for the root, so the rest of the root row (its chevron, its edit tools, pasting a whole definition) is json-edit-react's own. Without `setFragmentName` the button is a preview only.
- **A declaration's `constraints` are offered only where its type is an array:** `array`, or a union of `array` with `null`, which skips the constraints. Each constraint requires an array, so on any other type, `any` included, they would refuse every value but `null`, and registration doesn't check the pair. A change of type that leaves the constraints unfit drops them, in the same change, as does any change that arrives with them unfit (a paste, a raw-JSON edit). Inside, the keys are the three constraints: `length`, a number, starting at 2; `homogeneous`, chips picked from the basic types, `any` left out, starting as `['string']` since it can't be empty; and `elementShape`, plain JSON. A picker for `elementShape`, whose fields are declarations of their own, nested, comes later.
- **Everything else is plain JSON** held to the shape.
- **A whole definition pasted over the root,** its body included, replaces the definition: the body goes to the expression editor, and the rest is held to the shape as any other change is. A definition is often written whole, so this saves splitting it by hand.
- **Its issues** are registration's, outside the body ("Validation"), so it takes the host's `figTree`. Each tints its row as in the expression editor, and is listed beneath the tree in a messages area. Revealing a row from the list comes later.

---

## Authoring state: `useFragmentEditor` — **Agreed**

The host lays out the components, but the state and logic behind them belong to the editor, in a hook. The host gives it the instance and the fragments it starts with, and wires what it returns into the components and its own buttons:

```tsx
const fragmentEditor = useFragmentEditor({
  figTree,
  initialFragments, // the definitions to start with, bodies included
  initialDraft, // optional: { definition, name }, to restore a draft
  onFragmentsChange, // optional: (fragments) => persist them
  confirmDiscard, // optional: () => boolean | Promise<boolean>, window.confirm by default
})

<FragmentSelect {...fragmentEditor.selectProps} />
<FigTreeEditor figTree={figTree} {...fragmentEditor.editorProps} />
<FragmentDefinitionEditor figTree={figTree} {...fragmentEditor.definitionProps} />
<button disabled={!fragmentEditor.canSave} onClick={fragmentEditor.save}>Save</button>
```

It also returns `undo`, `redo`, `canUndo` and `canRedo`, `startFromExpression(expression)`, `hasUnsavedEdits` with `discard()`, `draft`, and `fragments` with `setFragments(fragments)`.

- **The hook holds the fragments.** An instance never returns a fragment's body (`getFragments()` leaves out `expression` and `samples`), so whatever loads a fragment into the editors must keep the definitions itself. The hook registers `initialFragments` on the instance when it is first rendered, and from then on is the only thing that changes the instance's fragments. `fragments` is the current record, and `setFragments` replaces it whole, for a host's own fragments editor such as the demo's Config panel. A host persists them through `onFragmentsChange`, called with the whole record after each change that registers.
- **And the draft:** the definition being edited, its name, the version last saved, whether it has been edited since it was started or loaded, and its undo history. The components stay controlled, with plain props: the hook only builds them, so a host can still wire them by hand. Rejected: a context provider the components read from, which hides the wiring.
- **The picker, `FragmentSelect`,** is the editor's `Select`, listing `figTree.getFragments()` as the toolbar's fragment picker does. Its placeholder, "Select fragment", shows while the draft is not a registered fragment. Its name keeps it apart from the toolbar's `FragmentPicker`.
- **Picking a fragment** loads its definition into both editors, and its name, and clears the undo history, so undo never brings back another fragment's body. A draft with unsaved edits is discarded only once `confirmDiscard` resolves true, so a host can open its own dialog.
- **Switching to fragment mode** is the host's, which calls `startFromExpression(expression)`. It starts a new, unnamed fragment with the expression as its body and every other field there to fill in: `parameters`, `samples` and `metadata` empty, and `description` seeded ("Set fragment description..."), unless the draft has edits not yet saved, which keeps it. A draft started from the expression and never edited is replaced, so switching back and forth picks up the expression's changes.
- **Discarding.** `hasUnsavedEdits` is true when the draft has been edited since it was started, loaded or last saved, or is named but never registered. `discard()` drops those edits: a registered fragment goes back to its saved version, and a draft never registered is replaced by an empty one. The undo history is cleared, as on picking a fragment. Either way the next `startFromExpression` takes the expression. When to offer it is the host's.
- **Saving.** `canSave` is true when the draft has a name, and is unregistered or differs from its saved version. They are compared by value, so undoing back to the saved version disables it again, and a fragment just loaded starts with it disabled. `save()` registers the draft under its name.
- **A rename saves at once,** so there is only ever one name. A registered fragment's saved version moves to the new name, in one `updateOptions()` with the old name `null`, and the draft's unsaved edits stay unsaved. A draft never registered is only named, and Save registers it. A registered fragment can't be left unnamed, so clearing its name cancels the rename.
- **A refused registration,** from a save or a rename, changes nothing. Its error is listed in the definition editor's messages area, where registration's issues already are, so the host shows nothing itself. A rename or a change of declarations that breaks a fragment calling this one is refused by registration's own checks, and the hook does nothing more about it, since fragments calling fragments are uncommon.
- **Undo** covers the definition only, since a rename is a save, not an edit.

---

## Body, declarations and samples, as built — **Findings**

_How the three blocks affect each other in the editor as built, checked against the code, for going through point by point. Where it differs from the sections above, this records the code, not the decision._

**The pieces.** The body (`expression`) is edited in `FigTreeEditor`. The declarations (`parameters`) and the samples (`samples`, keyed by declared names only) are edited in `FragmentDefinitionEditor`. `metadata.seeds` comes in only as the starting value for a new sample. Both editors write one `FragmentDefinition`, held by `useFragmentEditor`. The links between the blocks are in [declareParameters.ts](../src/declareParameters.ts) (declarations from the body), `followParameters` and `addSamples` in [definitionShape.ts](../src/definitionShape.ts) (samples and seeds following declarations), and [unusedParameters.ts](../src/unusedParameters.ts).

**Two rules run through everything:**

- **Required** is `required ?? (no default)`, so a declaration with neither is required.
- **A new sample's value** is `getStartingValue`: the parameter's seed if it has one, otherwise a value for its type. A literal union gives its first member, `string` and `any` give `"Replace me"`, `number` gives 1, `boolean` gives `true`, and a union gives its first non-null member's value.

### What loads when

| Event                                                                                | Declarations                                                                                                                 | Samples   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| `startFromExpression(expr)`                                                          | `{}`. Each `$params` reference in the body is an `unresolved-param` error with a "Declare" fix, since a load is not an edit. | `{}`      |
| Picking a saved fragment                                                             | As saved                                                                                                                     | As saved  |
| A body the host changes, an undo, or a body pasted over the definition editor's root | Unchanged. Only an edit in the expression editor declares (the arrival write-back doesn't).                                  | Unchanged |
| The empty starting draft                                                             | `{}`                                                                                                                         | `{}`      |

### Changes in the body (expression editor)

| Action                                                                           | Declarations                                                                                                                                                                                           | Samples                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| An edit brings in a new name (read after the edit, not before)                   | Declared in the same write. Its type is what the reference's position admits; `any` for a drill, a template token, a `get`, plain data, or positions that disagree. Required, since it has no default. | A sample is added, since the parameter is new and required. |
| A name already declared                                                          | The declaration is never changed, its type included.                                                                                                                                                   | Unchanged                                                   |
| A name the body already read while undeclared (its declaration deleted, for one) | Other edits don't declare it. It stays an `unresolved-param` error until **Declare**, which declares it as an edit would.                                                                              | A sample is added with the declaration.                     |
| The last reference removed                                                       | The declaration stays, with an "unused" warning and a **Remove** fix. There is no warning where the body has dynamic reads (a bare `$params`, or a computed path from it).                             | Kept. **Remove** also removes the sample and the seed.      |
| A typo (`$params.contry`)                                                        | A second declaration is added. The real one shows as unused if nothing else reads it.                                                                                                                  | The typo gets a sample too.                                 |
| The **Parameter** entry in the type dropdown                                     | Inserts `$params.<first declared>`, whatever its type, or `$params.` where none is declared.                                                                                                           | —                                                           |

### Changes in the declarations (definition editor)

| Action                                                                     | Body                                                                                                                                                       | Samples                                                                                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Add one by hand                                                            | Starts as `{ type: 'any' }`, so it is required. Where the body doesn't read it, it has the unused warning.                                                 | A sample is added (`"Replace me"`, or the seed).                                                                                             |
| Delete one the body still reads                                            | Each reference is an `unresolved-param` error with **Declare**.                                                                                            | The sample and the seed are removed. **Declare** adds a new sample.                                                                          |
| Rename the key                                                             | The references are not rewritten (F8). The old name is an `unresolved-param` error, which **Declare** declares again, and the renamed one shows as unused. | The sample and the seed are renamed in place.                                                                                                |
| Change `type`                                                              | Not checked against where the body reads it. Constraints are dropped where the new type isn't an array.                                                    | Unchanged, and not checked again.                                                                                                            |
| Add a `default`, so it is optional                                         | —                                                                                                                                                          | Kept                                                                                                                                         |
| Add `required`, which starts as the opposite of what the declaration means | —                                                                                                                                                          | Kept when it is set false. When it is set true, no sample is added, so ▶ is refused until there is one.                                      |
| `required: true` with a `default`                                          | —                                                                                                                                                          | — (registration's error, on the `default`)                                                                                                   |
| Paste a whole definition                                                   | The body goes to the expression editor, its references not declared.                                                                                       | Sample keys not declared are refused. A new required declaration without a sample gets one, and a removed declaration's sample goes with it. |

### Changes in the samples

- **Add:** the ＋ on `samples` offers only the declared names not yet present, and a key that isn't declared is refused. The value is `getStartingValue`'s. Adding the whole `samples` field again gives each required parameter a sample.
- **Remove:** nothing puts it back. For a required parameter, ▶ is refused; for an optional one, the call leaves it unset, so it takes its default, or null.
- **`null`** is unset, the same as a sample removed.
- **Edit a value:** nothing checks it until ▶.

### At ▶

`{ fragment: <temporary name>, parameters: samples }` is evaluated on `figTree.with()`, with the body or sub-tree registered under the definition's declarations:

1. A definition whose declarations don't register (a default of the wrong type, `required` with a `default`) refuses the ▶.
2. A required parameter whose sample is missing or null refuses the ▶, naming every such parameter, whether the row reads it or not.
3. Otherwise it is a real call: defaults applied, null as unset, and each sample type-checked against its declaration. A sample that fails fails the ▶, on the evaluated row.

### Not type-matched

1. **A declaration's type against where the body reads it.** `validate()` checks only that each name is declared, so a `string` parameter read in a `number` slot has no warning. The Parameter entry offers parameters whatever their type.
2. **A sample against its declaration's type,** only at ▶, by the call. Registration checks only that `samples` is an object (F20 in [v3-upstream.md](v3-upstream.md), Wanted).
3. **A declaration's type is set by the first reference.** Moving a reference, or adding others, never changes it.
4. **A sample doesn't follow a change of `type` or `required`.** A parameter made required later gets no sample, since `addSamples` only covers parameters new in that change.
5. **Seeds** are never type-checked.
6. **A default against its type** is the one pair checked: registration's error, on the `default`.

---

## Demo — **Agreed**

A fragment-authoring page wired through `useFragmentEditor`: the picker above the definition editor, the two editors, and a Save button. The Config panel's fragments editor reads and replaces the hook's `fragments`, and its "Reset fragments" replaces them with the defaults, so the demo's `applyOptions` leaves fragments to the hook. The draft is kept in localStorage, through `initialDraft` and `draft`. `confirmDiscard` opens a Chakra dialog. Switching back to expression mode with unsaved edits asks, in the same dialog, whether to discard them: "OK" calls `discard()`, so the next switch to fragment mode starts from the expression, and "Keep it" keeps the draft for then. The switch happens either way.

---

## Build plan

Each step ends with one or two expressions or definitions to try by hand in the demo.

1. **The definition's shape in fig-tree.** Rename `FragmentListing` to `FragmentMetadata`, and allow `samples` on the wrapper ("Upstream changes"). Until that ships, a stand-in type lives in `src/upstream.tsx`.
2. **The props, and fragment mode as a pass-through.** The props type becomes the union in "The props". In fragment mode, `fragmentDefinition.expression` is the editor's expression, and each edit is written back with the rest of the definition kept: `{ ...fragmentDefinition, expression }`. Nothing else changes yet, so `$params` rows carry `unresolved-param` errors.
3. **The demo.** A starting `FragmentDefinition` in state, and a switch between expression mode and fragment mode for the main editor.
4. **`FragmentDefinitionEditor`.** The component ("The definition editor"), with declarations added by hand. The details, colour pickers among them, are settled as it is built. Then, beside it, a pure function with its own tests that takes a body, its classification and its declarations, and returns the declarations with any missing ones added: the names from `getDependencies()`' `params` entry, each typed by the position it was typed at ("Parameters").
5. **Evaluation and validation.** Build them as settled in "Validation" and "Evaluation", on fig-tree's F9 and F19 ([v3-upstream.md](v3-upstream.md)). Validation comes first: until the body's `$params` references resolve, every row that reads one, and every row above it, has its ▶ blocked by their errors.
6. **Fragment mode in the expression editor.** The Parameter entry, autocomplete and every reference path for `$params` ("Parameters"); adding declarations through step 4's function, in the editor's update path; the fragment picker leaving out cycles (`fragmentName`); the unused-declaration warning.
7. **Finishing.** `useFragmentEditor` and `FragmentSelect` ("Authoring state"), and the demo wired through them ("Demo"), so a fragment authored in fragment mode can be saved and called from expression mode. Export them and the definition editor, with their types, from `src/index.ts`, the styles on the `editorTheme` tokens, and the bundle budget in `scripts/entries.mjs`.
8. **Back to the published fig-tree.** fig-tree's `3.0.0-preview.13` carries the changes the fragment editor needs. Both `package.json` files take it, `pnpm dev` runs `demo:local`, and the demo's `tsconfig.json` reads fig-tree from npm.

---

## Upstream changes

To be logged in [v3-upstream.md](v3-upstream.md) once agreed:

- **Rename `FragmentListing` to `FragmentMetadata`** (fig-tree, `catalogTypes.ts`).
- **Allow `samples` on the definition wrapper** (fig-tree, `DEFINITION_KEYS` in `fragments.ts`), and add it to `FragmentDefinition`. The engine ignores it, unless registration checks it (Open above).
- **A `params` entry on `getDependencies()`** (fig-tree): the parameter names an expression reads, in every form a reference takes, not following calls into called fragments' bodies.
- **`with(update)`, an instance derived with an options update** (fig-tree), for evaluating a draft ("Evaluation"). Logged as F19. It makes F10 unnecessary, so F10 is dropped.
- **F20, registration type-checks `samples`** (fig-tree), and a literal union's failure gives the value.
- **F9, the fragment-body option on `validate()`** (fig-tree, already logged), for validating a body ("Validation").
- **F8, the scope-aware rename helper** (fig-tree, already logged), for renaming a parameter.
- **F21, `unresolved-param` names its parameter, with a suggestion** (fig-tree), for the quick fix that declares it.
