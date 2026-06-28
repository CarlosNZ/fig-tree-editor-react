# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`fig-tree-editor-react` is a React component library for visually constructing and editing
[**FigTree Evaluator**](https://github.com/CarlosNZ/fig-tree-evaluator) expressions (a JSON-based
expression/templating language). It is published to npm and consumed as a `<FigTreeEditor />`
component.

It is **a thin specialisation of [json-edit-react](https://github.com/CarlosNZ/json-edit-react)
(JER)**, a general JSON viewer/editor. Nearly all behaviour comes from JER; this library only adds
FigTree-specific UI via JER's *Custom Node* mechanism. Understanding JER's custom-node API
(`customNodeDefinitions`, `CustomComponentProps`, `CustomWrapperProps`, `condition` filters,
`showOnEdit`, `wrapperComponent`) is a prerequisite for working here. Both fig-tree-evaluator and
json-edit-react are authored by the same maintainer, so a root-cause fix in those upstream packages
is a legitimate option, not just a local workaround.

## Commands

- **Build**: `yarn build` — rollup → CJS + ESM + `.d.ts` in `build/` (`prepublishOnly` runs it).
- **Lint**: `yarn lint` (eslint, flat config in `eslint.config.mjs`).
- **Run the demo** (primary way to see changes live):
  - `yarn dev` / `yarn demo:local` → demo against **raw `src/` TypeScript** (HMR; what you want while developing this library).
  - `yarn demo` → demo against the **published npm package**.
  - `yarn demo:pack` → builds, `npm pack`s, extracts to `pack-output/`, and runs the demo against the packed tarball (closest test to a real publish; see `scripts/pack.mjs`).
- **Tests**: there is a `jest.config.js` (expects tests under `test/`) but **no `test/` dir and no `test` script exist** — the library currently has no test suite.

## Dependency-source switching (important & non-obvious)

Two layers let you swap between local source and published packages without code edits:

1. **`src/_imports.ts`** re-exports `json-edit-react`. It exists so you can flip the library's own
   import of JER between the published package and a local checkout (`../package`) by toggling one
   line. All JER imports in `src/` go through `./_imports`, not `json-edit-react` directly.
2. **`demo/vite.config.ts`** aliases `@fig-tree-editor-react` (note the `@`) to one of four sources
   selected by `VITE_FIG_SOURCE` (`npm` | `local` | `build` | `pack`), set by the demo scripts
   above. In non-`npm` modes it must `dedupe` react/react-dom/fig-tree-evaluator/json-edit-react —
   a duplicate React breaks hooks, and a duplicate fig-tree/JER breaks `instanceof` checks and
   editor context.

`demo/` is a **separate package** with its own `package.json`, lockfile, and `node_modules`. When
bumping a shared dependency (fig-tree-evaluator, json-edit-react), update it in **both** the root
and `demo/`.

## Architecture

### Entry point: `src/FigTreeEditor.tsx`

Renders a single JER `<JsonEditor>` over the expression object and wires everything together:

- **`customNodeDefinitions`** is the heart of it: an ordered list mapping a `condition` (a
  `NodeData` predicate, often composed with `and`/`not`/`root`/`collections` from
  `@json-edit-react/utils/filters`) to a custom React component. This is what turns a plain
  `{ operator: "+", values: [...] }` object into the FigTree operator UI. The mappings:
  - operator node whose name is a registered **custom function** → `CustomOperator`
  - any other operator node → `Operator`
  - fragment node → `Fragment`
  - shorthand collection / shorthand-with-simple-value → `Shorthand` (`ShorthandNodeCollection` / `ShorthandNodeWithSimpleValue`)
  - first alias (`$alias`) row → an "Alias definitions:" header wrapper
  - root collection → `TopLevel` (`TopLevelContainer`)
- It also overrides JER's `theme`, `allowDelete` (blocks deleting required operator params and the
  root), `allowTypeSelection` (`getTypeFilter` restricts the type dropdown per operator parameter,
  including enums), and `onUpdate` (validates on every edit).
- `figTree.getOperators()/getFragments()/getCustomFunctions()` provide the metadata that drives all
  the selectors and validation; this is bundled as `figTreeData` and passed to every custom node.

### The "object-anchored custom node" + `buildOnEdit` pattern

This is the central design decision and the easiest thing to get wrong:

- Custom node components are **anchored on the operator/fragment object itself** (a stable path),
  not on the `operator`/`fragment` *key*. So `value` inside a component **is** the whole expression
  node. This is what lets an edit survive a node-type switch and reuse JER's built-in editing
  session (`showOnEdit: true` keeps the custom component rendered while editing instead of JER's raw
  JSON textarea). `useCommon.filterChildren` then hides the redundant `operator:`/`fragment:` child
  row, since the header (`DisplayBar`/selectors) already represents it.
- Edits never mutate in place. Components call **`onEdit(newValue, path)`** (from
  `buildOnEdit` in `src/useCommon.tsx`), which reads the latest full tree (`getLatestData`),
  `assign`s the new value at `path`, then runs it through **`updateExpression`** →
  `validateExpression` → `setExpression`. So every change re-validates and persists the *complete*
  expression.
- **`src/useCommon.tsx`** holds the shared logic for the Operator/Fragment/CustomOperator components
  (evaluate button, loading state, alias collection, `maybeInsertFallback`, the live-edit toolbar
  keyboard handling, and `startOpen`). The Shorthand components do *not* use `useCommon` but reuse
  `buildOnEdit` directly.

### Validation: `src/validator.tsx`

`validateExpression` is run on every update (from `onUpdate` and `updateExpression`). It recursively
walks the expression and, for operator/fragment nodes: strips properties that don't belong to that
operator/fragment (keeping `$alias` props and arbitrary props for operators that allow them), adds
missing **required** properties with defaults, and sorts keys into a canonical order (so DB
round-tripping through binary JSON can't reorder them). `cleanOperatorNode` strips to common
properties when switching operators; `getAvailableProperties` powers the "add property" selector.

### Helpers & node-type predicates: `src/helpers.ts`

Pure functions that classify `NodeData` (`isShorthandNodeCollection`,
`isShorthandNodeWithSimpleValue`, `isAliasNode`, `isFirstAliasNode`, `getTypeFilter`,
`getCurrentOperator`, `getAliases`, etc.). These are the predicates referenced by
`customNodeDefinitions` conditions and the theme. Note the two distinct shorthand shapes —
`{ $getData: { property: ... } }` (collection) vs `{ $getData: "path" }` (simple value) — they are
handled by different components.

### Supporting files

- `src/DisplayBar.tsx` — the header row for a node: name, description tooltip, Evaluate button, and
  Convert button (to V2 / to-shorthand / from-shorthand, via the `converters` from fig-tree).
- `src/CommonSelectors.tsx` — `NodeTypeSelector` (operator↔fragment↔custom switch),
  `OperatorSelector`, `FunctionSelector`, `PropertySelector`.
- `src/Select/` — a custom searchable dropdown used throughout (also re-exported from the package).
- `src/operatorDisplay.ts` — default colour scheme per operator; overridable via the
  `operatorDisplay` prop.
- A node-type switch sets the shared `justSwitchedTo` ref to the landed path so the freshly-rendered
  node auto-opens its picker (consumed once in `useCommon`).

## Conventions

- Code comments describe the **present state** only — no "used to be" / version-history framing.
- Components cast to `CustomNodeDefinition['component']` via `as unknown as ...` because JER's custom
  node prop types are broader than these specialised components; this is intentional, not a smell to
  "fix".
