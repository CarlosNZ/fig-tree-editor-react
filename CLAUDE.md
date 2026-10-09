# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`fig-tree-editor-react` is a React component library for visually constructing and editing
[**FigTree Evaluator**](https://github.com/CarlosNZ/fig-tree-evaluator) expressions (a JSON-based
expression/templating language). It is published to npm and consumed as a `<FigTreeEditor />`
component.

It is **a thin specialisation of [json-edit-react](https://github.com/CarlosNZ/json-edit-react)
(JER)**, a general JSON viewer/editor. Nearly all behaviour comes from JER; this library only adds
FigTree-specific UI via JER's _Custom Node_ mechanism. Understanding JER's custom-node API
(`customNodeDefinitions`, `CustomComponentProps`, `CustomWrapperProps`, `condition` filters,
`showOnEdit`, `wrapperComponent`) is a prerequisite for working here. Both fig-tree-evaluator and
json-edit-react are authored by the same maintainer, so a root-cause fix in those upstream packages
is a legitimate option, not just a local workaround.

## Commands

The repo is a pnpm workspace: the library at the root, plus `demo/`. One `pnpm install` at the root installs both. Node is ≥ 22.12 (`.nvmrc`), and `packageManager` pins the pnpm version. The tooling matches fig-tree-evaluator's, so the script names do the same jobs in both repos.

- **Checks.** These are what CI (`.github/workflows/ci.yml`) and `pnpm release` run, in this order:
  - `pnpm lint`
  - `pnpm format:check` (`pnpm format` to fix)
  - `pnpm typecheck`, which checks the library, then the tests through `tsconfig.test.json`
  - `pnpm test`
  - `pnpm build`
  - `pnpm check:package`
  - CI then runs the demo's checks, `pnpm -C demo lint` and `pnpm -C demo typecheck`.
- **Build.** `pnpm build` runs rollup to produce an ESM-only `build/index.js` and `build/index.d.ts`, then prints a bundle-size report. `pnpm size` reprints the report without rebuilding. The entries and their brotli budgets are in `scripts/entries.mjs`, and the build fails if `package.json`'s `exports` disagrees with them. Stylesheets are imported as `./styles.css?inline` text (`scripts/inlineCss.mjs`, the same as JER's) and injected by the component, not by a module side effect. The same text is published as `./style.css` (`STYLESHEET` in `scripts/entries.mjs`), for a host to add to a shadow root.
- **Packaging.** `pnpm check:package` (after a build) checks the size budget. It then `pnpm pack`s the package into `pack-output/`, installs that copy into a temporary consumer that has only the declared dependencies and peers, and imports, `require()`s and typechecks it there.
- **Tests.** vitest with React Testing Library, in jsdom. Tests live in `test/` (setup in `test/setup.ts`). `pnpm test:watch` runs them in watch mode.
- **Against an unpublished fig-tree.** `pnpm typecheck:local-evaluator` (through `tsconfig.local-evaluator.json`) and `pnpm test:local-evaluator` check the editor against the source of a sibling `../fig-tree-evaluator` checkout, as `pnpm demo:local-evaluator` runs it. Use them while an editor change depends on a fig-tree change that isn't published yet. Until it is, the plain `pnpm typecheck` and `pnpm test` (and CI) still read the npm version.
- **Release.** `pnpm release [--dry-run]` (`scripts/release.mjs`) bumps the version, runs the checks, commits, tags and publishes. It refuses while `package.json` has `"private": true`, which guards the unpublishable `3.0.0-dev`.
- **Style.** Prettier owns formatting (`.prettierrc.js`, 100 columns). ESLint holds comments to 80 characters: `//` comments through `comment-length`, which `--fix` reflows, and block comments through `max-len`.
- **Run the demo** (the primary way to see changes live):
  - `pnpm demo:local` → demo against the **raw `src/` TypeScript**, with HMR.
  - `pnpm dev` → the same as `pnpm demo:local-evaluator` (below) while the fragment editor is built, since it depends on unpublished fig-tree changes. The demo's `tsconfig.json` reads fig-tree's types from the sibling checkout too, falling back to npm where there is none. Both go back to npm once fig-tree publishes (`docs-dev/fragment-editor-design.md`, build plan).
  - `pnpm demo:local-evaluator` → the same, with fig-tree-evaluator also taken from the source of a sibling checkout (`../fig-tree-evaluator`).
  - `pnpm demo:local-jer` → the same, with json-edit-react and `@json-edit-react/utils` taken from the source of a sibling checkout (`../json-edit-react`), to try a JER change before publishing it.
  - `pnpm demo` → demo against the **published npm package**. No published editor runs on fig-tree v3 yet, so until the first v3 pre-release this mode stops with a message and the demo doesn't depend on the npm package.
  - `pnpm demo:pack` → builds, runs `check:package`, then runs the demo against the packed copy in `pack-output/`. This is the closest test to a real publish.

## Dependency-source switching (important & non-obvious)

Two layers let you swap between local source and published packages without code edits:

1. **`v1-src/_imports.ts`** re-exports `json-edit-react`. It exists so the v1 library's own import of JER can be flipped between the published package and a local checkout (`../package`) by toggling one line. The v3 `src/` has no equivalent, since the demo's `VITE_JER_SOURCE` (below) covers it.
2. **`demo/vite.config.ts`** aliases `@fig-tree-editor-react` (note the `@`) to one of four sources selected by `VITE_FIG_SOURCE` (`npm` | `local` | `build` | `pack`), set by the demo scripts above. Separately, `VITE_EVALUATOR_SOURCE=local` aliases `fig-tree-evaluator` and each of its subpaths to the sibling checkout's `src/`, for every importer, the library included. `VITE_JER_SOURCE=local` does the same for `json-edit-react` (the checkout's `src/`) and `@json-edit-react/utils` (its `packages/utils/src/`), which the demo imports. In non-`npm` modes the config must `dedupe` react/react-dom/fig-tree-evaluator/json-edit-react: a duplicate React breaks hooks, and a duplicate fig-tree or JER breaks `instanceof` checks and editor context.

`demo/` is a **workspace package** (`pnpm-workspace.yaml`). It shares the root's lockfile and install, but keeps its own `package.json` and `node_modules`. In `npm` mode it resolves the editor from npm rather than through a `workspace:` link, once a v3 editor is published. When bumping a shared dependency (fig-tree-evaluator, json-edit-react), update it in **both** `package.json` files, since there are no catalogs.

## Architecture

This section describes **v1**, whose components are in `v1-src/` (reference only, never imported or built), so read its `src/` paths as `v1-src/`. The v3 rewrite is planned in `docs-dev/v3-plan.md`, and Phase 11 rewrites this section for it.

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
  not on the `operator`/`fragment` _key_. So `value` inside a component **is** the whole expression
  node. This is what lets an edit survive a node-type switch and reuse JER's built-in editing
  session. `useCommon.filterChildren` then hides the redundant `operator:`/`fragment:` child row,
  since the header (`DisplayBar`/selectors) already represents it.

### Two editors per node: the variant pair + `displayBarEditPath`

Each operator/fragment/custom node intentionally supports **two** editors, and they must not collide:

- the **structured toolbar** (operator/type/property selectors), opened by the node's own DisplayBar
  pencil; and
- JER's **raw-JSON textarea**, opened by the generic collection edit-tools pencil.

Both go through the same JER editing session (`isEditing` on the same path), so the _only_ lever that
distinguishes them is **which variant of the node definition matches**. `FigTreeEditor`'s
`editVariants(def)` helper expands every node def into a pair:

- a **toolbar variant** — `showOnEdit: true`, whose `condition` additionally requires
  `toPathString(path) === displayBarEditPath`; and
- a **default variant** — `showOnEdit: false` (so editing falls back to JER's raw-JSON textarea).
  Type-selector identity (`name`/`defaultValue`/`showInTypeSelector`) lives only here, so each type
  is listed once.

`displayBarEditPath` is `FigTreeEditor` state, set/cleared per-node in `useCommon` (see below). The
DisplayBar pencil sets it to that node's path → the toolbar variant matches → structured toolbar.
The edit-tools pencil never sets it → that node stays on the default variant → raw JSON. Because the
discriminator is the node's _path_ (not a global boolean), a node opened via edit-tools never
momentarily matches the toolbar variant, so there's no flicker.

(Known minor wart: while the toolbar is open, JER hides _that_ node's own edit-tools row
(`showEditButtons = !isEditing`), since the object is the node being edited. Fixing it cleanly would
need a JER opt-in; left as-is for now.)

- Edits never mutate in place. Components call **`onEdit(newValue, path)`** (from
  `buildOnEdit` in `src/useCommon.tsx`), which reads the latest full tree (`getLatestData`),
  `assign`s the new value at `path`, then runs it through **`updateExpression`** →
  `validateExpression` → `setExpression`. So every change re-validates and persists the _complete_
  expression.
- **`src/useCommon.tsx`** holds the shared logic for the Operator/Fragment/CustomOperator components
  (evaluate button, loading state, alias collection, `maybeInsertFallback`, the live-edit toolbar
  keyboard handling, and `startOpen`). It also wraps the JER `setIsEditing`/`handleCancel` props as
  `startEditing`/`closeEditing`, which set/clear `displayBarEditPath` (so the DisplayBar pencil
  selects the toolbar variant above); a transition-guarded effect clears it if the edit ends without
  `closeEditing` (e.g. displacement). The Shorthand components do _not_ use `useCommon` but reuse
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
