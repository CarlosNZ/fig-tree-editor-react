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

**One piece of state.** The host holds one `FragmentDefinition`. The expression editor edits its `expression` and adds declarations ("Parameters"); the definition editor edits the rest. Both are controlled, so they cannot drift apart: they are two views of the same object.

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
<FragmentDefinitionEditor figTree={figTree} definition={definition} setDefinition={setDefinition} />
```

**The editor takes an expression or a fragment definition, never both.** The props type is a union: `expression` with `setExpression`, or `fragmentDefinition` with `setFragmentDefinition`. Passing `fragmentDefinition` is what switches fragment mode on. `setFragmentDefinition` takes the same `SetExpressionOptions` as `setExpression` (`autoUpdate`), so a host keeping history can record an automatic update in place.

**Why the whole definition, not the body.** Adding a declaration for a new reference changes the body and the declarations in one edit, so it reaches the host as one update: one step in a host's history, and never a body that references an undeclared parameter. Rejected: keeping `expression` and `setExpression` for the body and adding the declarations with a setter of their own, which turns that edit into two updates and has the host split the definition and put it back together.

**Separate props, not one object,** as `expression` and `setExpression` are, so nothing in the editor depends on the identity of an object the host builds on each render.

**The name is a prop of its own,** since `FragmentDefinition` has no `name`: a fragment is named by its key where it is registered, and registration rejects unknown keys on the definition. It is optional. A fragment not yet registered cannot be called by any other, so there is no cycle for the picker to prevent, and evaluating through a call can use a temporary name.

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

The changes are fig-tree's: the rename, `samples` among the wrapper's allowed keys, and their type check ("Upstream changes").

### Open

- Should `getFragments()` or `getCatalog` report `samples`? The definition editor gets the definition from the host, so it does not need them to.
- A declared `returns`, which registration would check against the inferred one. Inference covers the editor's needs, so this can wait.

---

## Parameters — **Agreed**

**A reference creates its declaration.** When an edit in the expression editor commits `$params.country` and `country` is not declared, the editor adds a declaration for `country`. With no default, it is required. The same applies to a template token (`{{$params.country}}`). A drill (`$params.country.code`) declares its first key. A `get` with a computed path declares nothing. The names come from `getDependencies()`' `params` entry (Upstream changes).

**Its type is what the reference's position admits** (the slot's `admits`), so `$params.country` typed into `plus.values` is declared `['number', 'string']`, and one typed into `if.condition` what `condition` admits. Where the position says nothing about the parameter's own value, the type is `any`: a drill, whose position admits the drilled value; a template token, whose value is turned into text; a `get`, unless its path is the parameter alone; and plain data. Where one edit adds the same new name at several positions (a pasted body), they must all agree on a type, otherwise it is `any`. A parameter added by hand in the definition editor also starts as `any`. An existing declaration's type is never changed.

**Nothing removes a declaration on its own.** When the last reference to a parameter goes, its declaration stays, flagged as unused, with a quick fix to remove it. fig-tree has no such warning, so the editor works it out from its own walk of the references.

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

In fragment mode the picker never offers the fragment being defined, or any fragment whose `dependencies.fragments` includes it, since using either would close a cycle. This needs the fragment's name (`fragmentName`), and no upstream change. Without a name, nothing is left out: a fragment not yet registered cannot be called by any other.

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
- **Its own components,** from `@json-edit-react/components`: a colour picker for `backgroundColor` and `textColor`, without opacity, and chips for `type`.
- **A declaration's `type` has three entries in the type selector,** one for each form it takes: **Single**, a basic type picked from a list (an enum); **Multiple**, a union shown as chips picked from the basic types, `any` left out since a union with it is `any`; and **Literal**, a literal union of strings shown as chips typed freely. Switching from Single to Multiple keeps the type as the union's one member. A switch to Single takes the list's first type (`any`), since json-edit-react's switch to an enum reads the value before the definition's `toStandardType`; with that changed, it would keep the union's first member, or `string` from a literal union.
- **Everything else is plain JSON** held to the shape. A picker for `constraints` comes later.
- **A whole definition pasted over the root,** its body included, replaces the definition: the body goes to the expression editor, and the rest is held to the shape as any other change is. A definition is often written whole, so this saves splitting it by hand.
- **Its issues** are registration's, outside the body ("Validation"), so it takes the host's `figTree`. Each tints its row as in the expression editor, and is listed beneath the tree in a messages area. Revealing a row from the list comes later.

---

## Demo — **Proposed**

A fragment-authoring page: the two components side by side, and a button that registers the definition through `updateOptions()`, beside the Config panel's "Reset fragments".

---

## Build plan

Each step ends with one or two expressions or definitions to try by hand in the demo.

1. **The definition's shape in fig-tree.** Rename `FragmentListing` to `FragmentMetadata`, and allow `samples` on the wrapper ("Upstream changes"). Until that ships, a stand-in type lives in `src/upstream.tsx`.
2. **The props, and fragment mode as a pass-through.** The props type becomes the union in "The props". In fragment mode, `fragmentDefinition.expression` is the editor's expression, and each edit is written back with the rest of the definition kept: `{ ...fragmentDefinition, expression }`. Nothing else changes yet, so `$params` rows carry `unresolved-param` errors.
3. **The demo.** A starting `FragmentDefinition` in state, and a switch between expression mode and fragment mode for the main editor.
4. **`FragmentDefinitionEditor`.** The component ("The definition editor"), with declarations added by hand. The details, colour pickers among them, are settled as it is built. Then, beside it, a pure function with its own tests that takes a body, its classification and its declarations, and returns the declarations with any missing ones added: the names from `getDependencies()`' `params` entry, each typed by the position it was typed at ("Parameters").
5. **Evaluation and validation.** Build them as settled in "Validation" and "Evaluation", on fig-tree's F9 and F19 ([v3-upstream.md](v3-upstream.md)). Validation comes first: until the body's `$params` references resolve, every row that reads one, and every row above it, has its ▶ blocked by their errors.
6. **Fragment mode in the expression editor.** The Parameter entry, autocomplete and every reference path for `$params` ("Parameters"); adding declarations through step 4's function, in the editor's update path; the fragment picker leaving out cycles (`fragmentName`); the unused-declaration warning.
7. **Finishing.** Export the component and its types from `src/index.ts`, its styles on the `editorTheme` tokens, the bundle budget in `scripts/entries.mjs`, and a "Register" button in the demo beside "Reset fragments", so a fragment authored in fragment mode can be called from expression mode.
8. **Back to the published fig-tree.** fig-tree publishes no preview until this is built, since the two are changed together. Meanwhile `pnpm dev` runs the demo on the sibling checkout's fig-tree (`demo:local-evaluator`), and the demo's `tsconfig.json` reads its types from there, and the library is checked with `typecheck:local-evaluator` and `test:local-evaluator`. Once fig-tree publishes, both `package.json` files take the new version, `pnpm dev` goes back to `demo:local`, and the demo's `tsconfig.json` drops its fig-tree paths.

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
