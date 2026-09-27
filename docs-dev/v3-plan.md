# fig-tree-editor-react v3 — plan

_Working document, September 2026. It sets out how the editor moves from fig-tree-evaluator v2 to v3. Amend it freely as work proceeds. Once agreed, each phase will probably become a GitHub issue._

## Goal and posture

Editor v3.0.0 targets fig-tree-evaluator v3, a ground-up rewrite with new syntax and a new API. From here on, the editor's major version tracks the evaluator's: editor vN is the editor for FigTree vN. Breaking changes that affect only the editor should wait for the next evaluator major where possible. The README states this policy.

**This is a full rewrite of the components, not a port.** The components and their implementations are built fresh against v3. These parts of v1 carry over:

- **The architecture.** A single JER `<JsonEditor>` over the expression, with FigTree UI supplied as custom node definitions (`customNodeDefinitions` with `condition` predicates).
- **The patterns, re-derived deliberately rather than copied.** They are sound, and they are also where v1's subtle bugs were found and fixed, so read the v1 code and its comments before re-implementing them:
  - **Object-anchored custom nodes.** A node is anchored on the operator/fragment object itself, not on its `operator` key. So `value` is the whole node, an edit survives a change of node type, and JER's editing session is reused.
  - **`buildOnEdit`.** Components never mutate in place. They call `onEdit(newValue, path)`, which reads the latest full tree, assigns the new value, and runs the complete expression through the editor's fill-in step and validation before persisting it.
  - **Two editors per node.** `editVariants` expands each node definition into a toolbar variant and a default variant, and `displayBarEditPath` chooses between them. This keeps the structured toolbar (opened by the node's own pencil) separate from JER's raw-JSON textarea (opened by the generic edit-tools pencil).
- **Generic pieces, kept verbatim:** `Select/` (the searchable dropdown), `Icons.tsx`, and most of `styles.css`, so the layout stays familiar.

**v3 provides much of what v1 built by hand.** Use it rather than rebuilding it:

| v1 editor code                                    | v3 replacement                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `operatorDisplay.ts` (colours, names)             | `fig-tree-evaluator/editor-hints`: `displayName`, `docUrl`, colours, category grouping and order (`CategoryHints`), and `seeds` (starting values) for new parameters. A host describes a fragment's display with `FragmentHints` in its `metadata`.                |
| `validator.tsx` (most of it)                      | `fig.validate()`: synchronous, needs no data, and reports each problem with the node's path. The editor keeps only the step that changes the tree, such as adding required parameters with their seeds. The format spec explicitly leaves that step to the editor. |
| `DisplayBar` convert buttons                      | `fig-tree-evaluator/format`: `toCanonical`, `toShorthand`, `toGet`, `toReference`. The spec was written with this editor's "To shorthand", "To full node", "To reference" and "To get node" affordances in mind.                                                   |
| `CustomOperator.tsx` and custom-function handling | Nothing. `defineOperator()` is v3's only extension API, so host operators are ordinary operators with full metadata, and one Operator component serves them all.                                                                                                   |
| Evaluate-error display                            | Evaluate with `mode: 'report'` and `trace: true`. Failures carry the path of the node responsible, so the editor can highlight it.                                                                                                                                 |
| —                                                 | New to v3: `getDependencies()` lists the data paths an expression reads.                                                                                                                                                                                           |

These v3 specs matter most for the editor. They are in the fig-tree-evaluator repo under `docs-dev/v3-specs/`:

- `v3-format.md` (the conversion functions, and the editor's use of them)
- `v3-evaluator-methods.md` (validate, report and trace, and how the editor combines them)
- `v3-operator-parameters.md` (parameter metadata and the editor-hints module)
- `v3-api.md` (syntax, references and `vars`, `//` comments, fragments)
- `v3-packaging.md` (entry points)
- `docs-dev/imports.md` (the import map)

## Working rules

1. **The demo runs at the end of every phase from Phase 2 on.** Each phase adds capability on top of a working editor, and no phase leaves the build or `pnpm dev` broken. Phases 0 and 1 are the exception for `pnpm dev`: Phase 0 freezes the v1 components and the new `src/` has no `FigTreeEditor` until the Phase 2 skeleton, so only the npm-mode demo (`pnpm demo`) runs until then. The library build still works at the end of both.
2. **`v1-src/` is reference only.** It is never imported, built or linted, and it is deleted before 3.0.0 ships.
3. **Upstream fixes are in scope.** The same maintainer owns fig-tree-evaluator and json-edit-react. When the editor needs something from either one (a hint field, a format option, a JER opt-in), prefer a root-cause change upstream over a local workaround. Record each such change under "Upstream changes" at the end.
4. **Test the pure logic as it is written.** Node classification, fill-in and path helpers each get tests alongside the code (see Phase 1).
5. **Findings from the design phase flow back into this plan.** Phases 4 onwards are provisional until Phase 3 closes.

---

## Phase 0 — Housekeeping

- **0.1 · Branching.** `main` stays the active 1.x branch while v3 is developed, and patch releases go out from it as usual. `v3.0-dev` takes v1 fixes from `main` only where they still apply, such as fixes to the demo or tooling, since the v3 components are new code. The `v1.x` maintenance branch is cut at release (Phase 10).
- **0.2 · Freeze v1 as reference.** Move `src/` to `v1-src/`. Exclude it from `tsconfig`, rollup and eslint, and add a lint rule that bans imports from it. Copy `Select/`, `Icons.tsx` and `styles.css` into the new `src/`.
- **0.3 · Dependencies.**
  - Move `fig-tree-evaluator` to `peerDependencies` as `^3.0.0` (or the current preview range until 3.0.0 is out), and keep it as a devDependency for development. `json-edit-react` and `@json-edit-react/utils` stay as regular dependencies, since consumers don't touch them directly.
  - Bump the root only. `demo/` stays on fig-tree v2 until Phase 2.3: its `dedupe` rule forces a single fig-tree copy in every mode, so a v3 bump there breaks even the `npm` mode (the published v1 editor can't run on v3).
- **0.4 · Local fig-tree source.** Add a vite alias mode that resolves `fig-tree-evaluator` to the local checkout at `../fig-tree-evaluator`, alongside the existing `VITE_FIG_SOURCE` modes. Keep the `dedupe` rules so only one copy of fig-tree and React exists. Also decide whether `src/_imports.ts` needs a matching toggle for fig-tree.
  - Done as a separate `VITE_EVALUATOR_SOURCE` (`npm` | `local`), run with `pnpm demo:local-evaluator`. Every entry point (`fig-tree-evaluator`, `/format`, `/editor-hints`, `/migrate`) maps to the matching directory under the checkout's `src/`.
  - Decided: no fig-tree toggle in `_imports.ts`. The vite alias applies to every importer, `../src` included, so the library already runs on the local fig-tree without a code edit. A comment toggle would need one re-export per entry point and is easy to commit by accident. The remaining gap is types: tsc, eslint and the IDE still see the npm package, so using fig-tree API that hasn't been released yet needs the root's `fig-tree-evaluator` linked to the checkout (for example with `pnpm link` after Phase 1).
- **0.5 · Version.** Set the version to `3.0.0-dev` to mark a development phase with no releases planned for a while. It is never published: in semver, `dev` sorts above `alpha` and `beta`, so a published `3.0.0-dev` would outrank later pre-releases. The first published pre-release sets its own version. `package.json` also sets `"private": true`, so `npm publish` refuses outright while `npm pack` (and so `demo:pack`) still works. Remove it when the first pre-release goes out.
- **0.6 · Demo deployment guard.** `demo`'s `deploy` script publishes to the live v2 playground (`carlosnz.github.io/fig-tree-evaluator`). Make sure a v3 demo can't be deployed there before release, for example by disabling the script on this branch or pointing it at a separate preview location.
  - Done by disabling it: `deploy` prints why and exits with an error, and `predeploy` is removed so nothing builds first. A preview location can be added later if a hosted v3 preview is wanted before release.
  - The live scripts, to restore in Phase 10: `"predeploy": "pnpm build"` (`yarn build` before 1.1) and `"deploy": "gh-pages -d dist -r https://github.com/CarlosNZ/fig-tree-evaluator.git"`.

## Phase 1 — Tooling

Bring the repo's tooling in line with fig-tree-evaluator's, so both repos work the same way. This comes before the skeleton so every line of new code is written under the final lint and format rules. Use the fig-tree repo's config files as the templates, and diverge only where this repo being a React library requires it.

- **1.1 · pnpm.**
  - Move the root and `demo/` from yarn to pnpm, pinning the same pnpm version as fig-tree in `packageManager`.
  - Run `pnpm import` before deleting each `yarn.lock`, so the resolved versions carry over.
  - Add `engines` and `.nvmrc` with fig-tree's Node floor (22.12), and `pnpm.onlyBuiltDependencies` where install scripts need it.
  - Replace every `yarn` call in scripts: the root `package.json`, `demo/package.json` and `scripts/pack.mjs`.
  - Done. Both lockfiles were merged and imported in one `pnpm import` at the workspace root (1.2). Where the two resolved a transitive dependency to different versions within the same range (62 specifiers, all patch or minor), the root's version was kept. `esbuild` is the only dependency whose install script needs allowing. The root gains explicit `react` and `react-dom` devDependencies at `^18.3.1`: under yarn it had no `react` and a stray `react-dom@19`.
  - pnpm runs pre/post hooks for ordinary scripts (`enable-pre-post-scripts` defaults to true), so the demo's `prebuild` still fires, and so will `predeploy` when Phase 10 restores it.
- **1.2 · Decide: should the demo be a pnpm workspace?**
  - For: one lockfile and one install, and no need to bump a shared dependency in two places. A `workspace:` link could also replace the demo's `local` alias mode.
  - Against: the demo's `npm` and `pack` modes rely on it resolving the editor independently of the root, and it deploys on its own.
  - Recommendation: try a workspace, and fall back to two separate pnpm packages if the `VITE_FIG_SOURCE` modes get awkward.
  - Decided: a workspace (`pnpm-workspace.yaml` lists `demo`), with no catalogs and no `workspace:` links. Neither "for" holds on its own. The demo still declares its own versions unless it uses catalogs, and `npm pack` (in `scripts/pack.mjs`) doesn't rewrite `catalog:`. A `workspace:` link resolves the built package, so it can't stand in for the raw-source `local` mode, and the `npm` mode must resolve the published editor. Neither "against" bites either. pnpm 10 doesn't link workspace packages by default, and `3.0.0-dev` doesn't satisfy the demo's `^1.0.1`, so the demo still gets the published editor. All four `VITE_FIG_SOURCE` modes are unchanged. What the workspace gives is one install and one lockfile. Revisit catalogs at 2.3, when both packages are on fig-tree v3, switching `pack.mjs` to `pnpm pack` at the same time.
- **1.3 · Scripts.** Use the same names as fig-tree wherever the job is the same: `lint`, `format`, `format:check`, `typecheck`, `test`, `build`, `dev`, `size`, `check:package`, `release`. Port what applies from fig-tree's `codegen/`: the release script, the bundle-size report and the packed-package check. Merge the last one with the existing `scripts/pack.mjs`.
  - Done: `lint`, `format`, `format:check`, `typecheck`, `build`, `dev` and `release`. The ported scripts live in `scripts/`, which this repo already had, rather than a `codegen/`. `release` is fig-tree's, less the `src/version.ts` step (the editor has no version constant). It refuses to start while `"private": true` is set, rather than failing at `npm publish` after committing and tagging. `typecheck` runs `tsc` over the lint project, which covers all of `src/`. The demo joins it in Phase 2, once `src/` has the `FigTreeEditor` the demo imports.
  - Moved to 1.6, and done there: `size` and `check:package`. They measure and install the build as it's shaped (ESM-only, `exports` map), so they're written with that build. `test` arrives with 1.7.
- **1.4 · Prettier.** Change `.prettierrc.js` to ESM. Add a `.prettierignore` that mirrors the eslint ignores (including `v1-src/`), and format the whole repo (`prettier --write .`, covering Markdown too), not just `src/`.
  - Done. `demo/` is formatted with the rest of the repo, though ESLint lints it separately. `demo/src/version.ts` is ignored, since the demo's `prebuild` writes it.
- **1.5 · ESLint.**
  - Adopt fig-tree's comment-length setup: `eslint-plugin-comment-length` for `//` comments at 80 characters, and `max-len` for block comments. That replaces the `@stylistic/max-len` rule here.
  - Keep what is specific to this repo: the React and hooks rules, and type-aware linting.
  - Add the ban on imports from `v1-src/`.
  - Done. The ban on `v1-src/` imports dates from 0.2. `max-len` keeps this repo's exemptions for strings, template literals and regexes, since an SVG path in `Icons.tsx` can't be broken. `eslint .` also covers the repo's Node tooling (`scripts/`, the rollup config).
- **1.6 · Packaging.** Go ESM-only to match fig-tree v3, whose Node floor is 22.12. Add `"type": "module"` and an `exports` map, and drop the CJS build. If there's a reason to keep CJS, record it here.
  - Decided: ESM-only. fig-tree v3 is an ESM-only required peer, so a CJS build of the editor would let nobody run it who couldn't already. The one real CJS case, a consumer's Jest suite, hits fig-tree first. Adding a CJS build later is non-breaking, and removing one is not.
  - Done. `build/index.js` and `build/index.d.ts`, with an `exports` map checked against `scripts/entries.mjs` at build time, as fig-tree does. Externals are read from the manifest's dependencies and peers, subpaths included. Terser runs with its defaults. v1's `mangle: false` had no recorded reason. There's no `sideEffects` field: the package is one file, so the module-level flag couldn't drop anything a consumer imports.
  - Styles follow json-edit-react v2: `import css from './styles.css?inline'` yields the minified text, through the `inlineCss` plugin (`scripts/inlineCss.mjs`, the same as JER's) in the build and natively in Vite. The component injects the text on mount, so the module has no side effect at import, and the demo's `local` mode runs the same path as the bundle. This replaces `rollup-plugin-styles`, which needed rollup 2.
  - `tsconfig.json` is modelled on fig-tree's (ES2022, bundler resolution, the stricter checks, DOM libs, no Node types) and covers all of `src/`, so `tsconfig.eslint.json` is gone. `typecheck` is `tsc --noEmit`.
  - `size` and `check:package` (from 1.3) are ported. `check:package` checks the brotli budget, then packs the package into `pack-output/` for the demo's `pack` mode, replacing `scripts/pack.mjs`. Then it installs the packed copy into a temporary consumer that has only the package's declared dependencies and peers. There it checks an ESM import, a `require()`, and typechecking under nodenext, bundler and node resolutions. fig-tree's tree-shaking fixtures aren't ported. `pack-demo` is `pnpm build && pnpm check:package`.
- **1.7 · Test runner.**
  - Replace the unused jest config with vitest, plus React Testing Library for later component tests, and add the `test` script.
  - This is a deliberate difference from fig-tree, which uses jest. Vitest fits an ESM React library built alongside a Vite demo better.
  - Done. Vitest 5 in jsdom, with React Testing Library, `jest-dom` matchers and `user-event`. `test` is `vitest run`, and `test:watch` is `vitest`. Tests live in `test/`, as in fig-tree, with `tsconfig.test.json` (the library plus `test/`) so `typecheck` and type-aware linting cover them. Vitest itself only transpiles. The first suite covers `Select` through what a user does: opening it, filtering by search, and choosing or dismissing with the keyboard. jest, ts-jest, ts-node and `jest.config.js` are gone from the root. `demo/` still lists jest and ts-jest, unused, for Phase 2.3's cleanup.
- **1.8 · CI.** Add a GitHub Actions workflow modelled on fig-tree's `ci.yml` that runs `format:check`, `lint`, `typecheck`, `test` and `build`. Consider fig-tree's PR bundle-size comment (`pr-bundle-size.yml`) as well.
- **1.9 · Docs.** Update the Commands section of `CLAUDE.md` straight away, since the commands change here and it shouldn't wait for the Phase 10 rewrite.

## Phase 2 — Skeleton

- **2.1 · Minimal `FigTreeEditor`.** A new component with the same outline of props as v1 (the expression, a `FigTree` instance, `onUpdate`, and options). It renders a JER `<JsonEditor>` over the expression with **no custom nodes**. That's a working v3 editor, just an unstyled JSON one.
  - Port JER's `injectStyles` with it (called from a `useInsertionEffect`, deduplicated on a marked `<style>` element), importing `styles.css?inline` (see 1.6).
- **2.2 · Validation wired in.** Run `fig.validate()` on every update, and show its issues in a simple list for now, with each issue's path and message.
- **2.3 · Demo rewired.**
  - Get the demo running against the new component and v3, bumping `demo/`'s `fig-tree-evaluator` to the v3 range (deferred from 0.3). `demo/` is a separate package with its own lockfile.
  - Produce the demo's test expressions in v3 syntax. Generate most of them by running the v1 set through `fig-tree-evaluator/migrate` (`migrateV2Expression`), then review them by hand.
  - Replace or remove v2-specific demo plumbing, such as the custom-function definitions and the express/postgres setup, where it no longer applies.

At the end of this phase you can load, edit and validate any v3 expression in the demo, as raw JSON.

## Phase 3 — Design

Work out exactly what the v3 editor looks like and does before building any FigTree-specific UI. Much of it stays the same as v1, but v3 adds concepts that need UI designed from scratch, and some v1 behaviour will change. The output is a design doc, `docs-dev/v3-design.md`, plus mockups where they help. The design is reviewed and agreed before Phase 4 starts, and Phases 4 onwards are revised to match.

Questions to work through (a starting list, not exhaustive):

- **v1 behaviour.** What stays, what changes, and what goes. Walk through the v1 editor feature by feature: DisplayBar, node-type switching, operator/property selectors, the Evaluate button, conversions, alias definitions, the type filter, and how deletion is restricted.
- **Node forms.** How a node looks in each form: full, named shorthand (`{ $plus: { values: [...] } }`), positional shorthand (`{ $plus: [1, 2] }`), and references (`'$data.user.name'`). How a tree that mixes forms reads. Where the conversion affordances go, and when they're offered (they aren't offered inside `literal` payloads or `//` values).
- **Operator picker.** Grouping by category using `CategoryHints` order and colours, search, and host-defined operators appearing alongside core ones.
- **Parameters.** How the parameter metadata is surfaced: types, null policies, literal-union enums, constraints and positional parameters. Adding a parameter using seeds. Which parameters are required, and which can be deleted.
- **References and `vars`.** How reference strings are displayed and edited (they are plain strings in JSON). How `vars` blocks and their scoping are shown. Whether the editor can offer autocompletion for references in scope.
- **Comments and `literal`.** How `//` keys are displayed (inline notes, collapsed, or de-emphasised). How a `literal` payload is visually marked as data rather than expression.
- **Fragments.** Choosing a fragment and editing its `parameters`, plus the display hints taken from fragment `metadata`.
- **Diagnostics.** How `validate()` issues attach to nodes: inline markers, a summary panel, or both. How severity is shown.
- **Evaluation.** Evaluating a whole expression and individual nodes. Displaying trace output (which branch ran, which references resolved to null, which fallbacks fired). Highlighting the failing path in report mode. Surfacing `getDependencies()`, such as a "reads these data paths" view.
- **Public API.** The `FigTreeEditor` props, theming and overriding display, and what the package exports (keeping `Select`, for example). Whether to also export a standalone `./style.css`, as JER does for hosts that inject styles themselves (a Shadow DOM, say).
- **Dependencies on JER.** Anything the design needs that JER doesn't support yet. Each one becomes an upstream change (working rule 3).

## Phase 4 — Operator node (full form)

_Provisional; revise after Phase 3._

- The Operator custom node, anchored on the object, with its header showing the name, description and doc link from editor-hints, and colours from editor-hints.
- The operator selector, grouped by category.
- The two-editor pair: `editVariants`, `displayBarEditPath` and `buildOnEdit`.
- Host operators registered with `defineOperator()` work with no special handling.

## Phase 5 — Parameters

- The add-parameter selector, driven by the operator's parameter metadata.
- The type filter per parameter, including dropdowns for literal-union enums.
- The editor's fill-in step: add required parameters from seeds (`OperatorHints.seeds`, then `TypeSeeds`), and fix the key order so the tree renders predictably.
- Restrictions on deleting required parameters and the root.

## Phase 6 — Fragments

- The Fragment custom node: the fragment selector, editing `parameters`, and display hints from `FragmentHints`.
- Switching node type between operator and fragment.

## Phase 7 — Shorthand forms and references

- Rendering nodes in named and positional shorthand, and rendering references.
- Conversion affordances using `toCanonical`, `toShorthand`, `toGet` and `toReference`, applied to the selected node's subtree.

## Phase 8 — `vars`, comments and `literal`

- The UI for these, as decided in Phase 3.

## Phase 9 — Evaluation and diagnostics

- Evaluate the whole expression and individual nodes.
- Display report-mode failures by highlighting the responsible path, show trace output, and add the dependencies view.
- Replace Phase 2's plain issue list with the diagnostics UI from Phase 3.

## Phase 10 — Release prep

- Delete `v1-src/`.
- README (including the version-alignment policy), CHANGELOG, and a migration note for v1 consumers.
- Rewrite `CLAUDE.md` for the v3 architecture.
- Cut `v1.x` from `main` for future 1.x patches, then merge `v3.0-dev` into `main`.
- Restore the demo's `deploy` script (disabled in 0.6), then deploy the demo, replacing the live v2 playground in step with the fig-tree 3.0.0 release.
- Run `demo:pack` against the packed tarball, then publish 3.0.0. Remove `"private": true` from `package.json` first, if an earlier pre-release hasn't already.

---

## Upstream changes

Changes needed in fig-tree-evaluator or json-edit-react, logged as they come up.

| Package         | Change                                                                              | Why                                                                                                                      | Status                   |
| --------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| json-edit-react | Opt-in to keep a node's own edit-tools row visible while its custom toolbar is open | Known wart carried from v1: while the toolbar is open, JER hides that node's edit tools (`showEditButtons = !isEditing`) | Open — decide in Phase 3 |
