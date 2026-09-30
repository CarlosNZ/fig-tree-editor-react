# fig-tree-editor-react v3 — plan

_Working document, September 2026. It sets out how the editor moves from fig-tree-evaluator v2 to v3. Amend it freely as work proceeds. Once agreed, each phase will probably become a GitHub issue._

## Goal and posture

Editor v3.0.0 targets fig-tree-evaluator v3, a ground-up rewrite with new syntax and a new API. From here on, the editor's major version tracks the evaluator's: editor vN is the editor for FigTree vN. Breaking changes that affect only the editor should wait for the next evaluator major where possible. The README states this policy.

**This is a full rewrite of the components, not a port.** The components and their implementations are built fresh against v3. These parts of v1 carry over:

- **The architecture.** A single JER `<JsonEditor>` over the expression, with FigTree UI supplied as custom node definitions (`customNodeDefinitions` with `condition` predicates).
- **The patterns, re-derived deliberately rather than copied.** They are sound, and they are also where v1's subtle bugs were found and fixed, so read the v1 code and its comments before re-implementing them. Phase 3 kept the first and replaced the other two with json-edit-react's own mechanisms ([v3-design.md](v3-design.md), topic 2):
  - **Object-anchored custom nodes.** A node is anchored on the operator/fragment object itself, not on its `operator` key. So `value` is the whole node, an edit survives a change of node type, and JER's editing session is reused. Kept, for every node kind (topic 1, "Anchoring").
  - **`buildOnEdit`.** In v1, components never mutate in place: they call `onEdit(newValue, path)`, which reads the latest full tree, assigns the new value, and persists the complete expression. Replaced by `setValue` at the node's own path, json-edit-react's commit pipeline, with the fill-in step on the `setData` path ("Commit semantics").
  - **Two editors per node.** In v1, `editVariants` expands each node definition into a toolbar variant and a default variant, and `displayBarEditPath` chooses between them. Replaced by one definition whose component owns both editors, choosing between them in local state ("Two editors per node").
- **Generic pieces, kept verbatim:** `Select/` (the searchable dropdown), `Icons.tsx`, and most of `styles.css`, so the layout stays familiar.

**v3 provides much of what v1 built by hand.** Use it rather than rebuilding it:

| v1 editor code                                    | v3 replacement                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `operatorDisplay.ts` (colours, names)             | `fig-tree-evaluator/editor-hints`: `displayName`, `docUrl`, colours, category grouping and order (`CategoryHints`), and `seeds` (starting values) for new parameters. A host describes a fragment's display with `FragmentHints` in its `metadata`.                |
| `validator.tsx` (most of it)                      | `fig.validate()`: synchronous, needs no data, and reports each problem with the node's path. The editor keeps only the step that changes the tree, such as adding required parameters with their seeds. The format spec explicitly leaves that step to the editor. |
| `DisplayBar` convert buttons                      | `fig-tree-evaluator/format`: `toCanonical`, `toShorthand`, `toGet`, `toReference`. The spec was written with this editor's "To shorthand", "To full node", "To reference" and "To get node" affordances in mind.                                                   |
| `CustomOperator.tsx` and custom-function handling | Nothing. `defineOperator()` is v3's only extension API, so host operators are ordinary operators with full metadata, and one Operator component serves them all.                                                                                                   |
| Evaluate-error display                            | Evaluate with `mode: 'report'` and `trace: true`. Failures carry the path of the node responsible, so the editor can highlight it.                                                                                                                                 |
| —                                                 | New to v3: `getDependencies()` lists the data paths an expression reads. The editor builds nothing on it: a host calls it directly (design, topic 7).                                                                                                              |

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
3. **Upstream fixes are in scope.** The same maintainer owns fig-tree-evaluator and json-edit-react. When the editor needs something from either one (a hint field, a format option, a JER opt-in), prefer a root-cause change upstream over a local workaround. Record each such change in [v3-upstream.md](v3-upstream.md), with its state and, once filed, its issue.
4. **Test the pure logic as it is written.** Node classification, fill-in and path helpers each get tests alongside the code (see Phase 1).
5. **Findings from the design phase flow back into this plan.** Phases 4 onwards were revised to match the design at the end of Phase 3, and follow it where they differ.

---

## Phase 0 — Housekeeping

- **0.1 · Branching.** `main` stays the active 1.x branch while v3 is developed, and patch releases go out from it as usual. `v3.0-dev` takes v1 fixes from `main` only where they still apply, such as fixes to the demo or tooling, since the v3 components are new code. The `v1.x` maintenance branch is cut at release (Phase 11).
- **0.2 · Freeze v1 as reference.** Move `src/` to `v1-src/`. Exclude it from `tsconfig`, rollup and eslint, and add a lint rule that bans imports from it. Copy `Select/`, `Icons.tsx` and `styles.css` into the new `src/`.
- **0.3 · Dependencies.**
  - Move `fig-tree-evaluator` to `peerDependencies` as `^3.0.0` (or the current preview range until 3.0.0 is out), and keep it as a devDependency for development. `json-edit-react` and `@json-edit-react/utils` stay as regular dependencies, since consumers don't touch them directly.
  - Bump the root only. `demo/` stays on fig-tree v2 until Phase 2.3: its `dedupe` rule forces a single fig-tree copy in every mode, so a v3 bump there breaks even the `npm` mode (the published v1 editor can't run on v3).
  - Revised in Phase 3 (topic 8, "Package exports" in [v3-design.md](v3-design.md)): `json-edit-react` becomes a peer (`^2.0.1`, the first release with J2, kept as a devDependency), as json-edit-react's own companion packages take it, since hosts pass its props and use its types and companions. `@json-edit-react/utils` stays a regular dependency. To do with the Phase 4 build, with `check:package`'s consumer installing it as a peer.
- **0.4 · Local fig-tree source.** Add a vite alias mode that resolves `fig-tree-evaluator` to the local checkout at `../fig-tree-evaluator`, alongside the existing `VITE_FIG_SOURCE` modes. Keep the `dedupe` rules so only one copy of fig-tree and React exists. Also decide whether `src/_imports.ts` needs a matching toggle for fig-tree.
  - Done as a separate `VITE_EVALUATOR_SOURCE` (`npm` | `local`), run with `pnpm demo:local-evaluator`. Every entry point (`fig-tree-evaluator`, `/format`, `/editor-hints`, `/migrate`) maps to the matching directory under the checkout's `src/`.
  - Decided: no fig-tree toggle in `_imports.ts`. The vite alias applies to every importer, `../src` included, so the library already runs on the local fig-tree without a code edit. A comment toggle would need one re-export per entry point and is easy to commit by accident. The remaining gap is types: tsc, eslint and the IDE still see the npm package, so using fig-tree API that hasn't been released yet needs the root's `fig-tree-evaluator` linked to the checkout (for example with `pnpm link` after Phase 1).
- **0.5 · Version.** Set the version to `3.0.0-dev` to mark a development phase with no releases planned for a while. It is never published: in semver, `dev` sorts above `alpha` and `beta`, so a published `3.0.0-dev` would outrank later pre-releases. The first published pre-release sets its own version. `package.json` also sets `"private": true`, so `npm publish` refuses outright while `npm pack` (and so `demo:pack`) still works. Remove it when the first pre-release goes out.
- **0.6 · Demo deployment guard.** `demo`'s `deploy` script publishes to the live v2 playground (`carlosnz.github.io/fig-tree-evaluator`). Make sure a v3 demo can't be deployed there before release, for example by disabling the script on this branch or pointing it at a separate preview location.
  - Done by disabling it: `deploy` prints why and exits with an error, and `predeploy` is removed so nothing builds first. A preview location can be added later if a hosted v3 preview is wanted before release.
  - The live scripts, to restore in Phase 11: `"predeploy": "pnpm build"` (`yarn build` before 1.1) and `"deploy": "gh-pages -d dist -r https://github.com/CarlosNZ/fig-tree-evaluator.git"`.

## Phase 1 — Tooling

Bring the repo's tooling in line with fig-tree-evaluator's, so both repos work the same way. This comes before the skeleton so every line of new code is written under the final lint and format rules. Use the fig-tree repo's config files as the templates, and diverge only where this repo being a React library requires it.

- **1.1 · pnpm.**
  - Move the root and `demo/` from yarn to pnpm, pinning the same pnpm version as fig-tree in `packageManager`.
  - Run `pnpm import` before deleting each `yarn.lock`, so the resolved versions carry over.
  - Add `engines` and `.nvmrc` with fig-tree's Node floor (22.12), and `pnpm.onlyBuiltDependencies` where install scripts need it.
  - Replace every `yarn` call in scripts: the root `package.json`, `demo/package.json` and `scripts/pack.mjs`.
  - Done. Both lockfiles were merged and imported in one `pnpm import` at the workspace root (1.2). Where the two resolved a transitive dependency to different versions within the same range (62 specifiers, all patch or minor), the root's version was kept. `esbuild` is the only dependency whose install script needs allowing. The root gains explicit `react` and `react-dom` devDependencies at `^18.3.1`: under yarn it had no `react` and a stray `react-dom@19`.
  - pnpm runs pre/post hooks for ordinary scripts (`enable-pre-post-scripts` defaults to true), so the demo's `prebuild` still fires, and so will `predeploy` when Phase 11 restores it.
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
  - Done: `.github/workflows/ci.yml`, one job on pushes to `main` and `v3.0-dev` and on every pull request, running the checks in `release`'s order and taking Node from `.nvmrc`. It doesn't lint or typecheck `demo/` yet, because the demo can't typecheck until Phase 2 gives `src/` a `FigTreeEditor`. Add both in 2.3.
  - Deferred: the PR bundle-size comment. `bundleSize.mjs --json` already emits what it needs, so fig-tree's `pr-bundle-size.yml` and `formatSizeDiff.mjs` can be ported when wanted.
- **1.9 · Docs.** Update the Commands section of `CLAUDE.md` straight away, since the commands change here and it shouldn't wait for the Phase 11 rewrite.
  - Done. The Commands and dependency-source sections of `CLAUDE.md` describe the Phase 1 tooling. Architecture carries a note that it describes v1, in `v1-src/`, until Phase 11.

## Phase 2 — Skeleton

- **2.1 · Minimal `FigTreeEditor`.** A new component with the same outline of props as v1 (the expression, a `FigTree` instance, `onUpdate`, and options). It renders a JER `<JsonEditor>` over the expression with **no custom nodes**. That's a working v3 editor, just an unstyled JSON one.
  - Port JER's `injectStyles` with it (called from a `useInsertionEffect`, deduplicated on a marked `<style>` element), importing `styles.css?inline` (see 1.6).
  - Done. The props are `figTree` (a `FigTree`, unused until 2.2), `expression` and `setExpression`, plus JER's own props passed straight through, `onUpdate` among them. Expressions are typed `unknown`, as fig-tree's methods take them. The evaluation props (`objectData`, `onEvaluate` and the rest) wait for Phase 10. The editor adds the `ft-editor` class to any `className` the host passes. The package no longer re-exports fig-tree, which is a peer the host imports itself. Phase 3 can revisit that under "Public API". So the demo imports its fig-tree names from `fig-tree-evaluator` directly, and in `local` mode it runs the new editor on its own fig-tree v2 (through `dedupe`) until 2.3.
  - Vitest's `css` option is on, since vitest otherwise resolves stylesheets to empty strings. The size budget is 2.7 kB, up from 1.35 kB, mostly the stylesheet. `check:package`'s legacy `node` consumer sets `allowSyntheticDefaultImports`, which `bundler` and `nodenext` already imply, because JER's declarations default-import React.
- **2.2 · Validation wired in.** Run `fig.validate()` on every update, and show its issues in a simple list for now, with each issue's path and message.
  - Done, together with 2.3. The editor calls `validate()` on every render and lists the issues below the editor, each with its severity, its path and its message. It doesn't memoise on the expression, because `updateOptions()` can change the registry without changing the instance. The list is a sibling of the `JsonEditor` rather than wrapped with it, so the host's layout props (`minWidth` and the rest) still apply to the editor itself. Paths are shown by `displayPath` (`src/paths.ts`), since JER's `toPathString` is an ID format, not a display one. The size budget is 3.0 kB.
- **2.3 · Demo rewired.**
  - Get the demo running against the new component and v3, bumping `demo/`'s `fig-tree-evaluator` to the v3 range (deferred from 0.3). `demo/` is a separate package with its own lockfile.
  - Produce the demo's test expressions in v3 syntax. Generate most of them by running the v1 set through `fig-tree-evaluator/migrate` (`migrateV2Expression`), then review them by hand.
  - Replace or remove v2-specific demo plumbing, such as the custom-function definitions and the express/postgres setup, where it no longer applies.
  - Add `pnpm -C demo lint` and a demo typecheck to CI (deferred from 1.8), and drop the demo's unused jest and ts-jest (from 1.7).
  - Done. The demo is on fig-tree v3 (`^3.0.0-preview.1`, then `^3.0.0-preview.2` from 4.1). Every demo expression validates with no issues and evaluates to the expected result, checked against the live APIs.
    - **Expressions.** Each ran through `migrateV2Expression`, then was reviewed by hand. The converter handled most of each tree. The hand fixes: the custom-function calls, and v2's `numberMap`, which became a `match` over a `length` held in `vars`. The Star Wars lookup's `additionalData` became `$vars.character.…` references, and the random-user template reads its var through `{{$vars.user.…}}` tokens, since a computed `substitutions` isn't searched for dotted names. A `match` `fallback` that stood for "no branch matched" became `default`. The converter's `trim: true`, redundant on these templates, came out. The demo blurbs are corrected where they describe FigTree's syntax, but not where they describe editor UI that returns in later phases.
    - **Custom functions and fragments.** The three custom functions are operators made with `defineOperator()`. The fragments are v3 definitions from `migrateV2Fragments`, reviewed. The Fragments demo's duplicate copy is gone, along with its stray `metadata` "fragment".
    - **Instance and options.** `src/figTree.ts` builds the instance with the core operators, `httpOperators()`, `sqlOperators()` over the Postgres bridge, which still applies, and the custom operators. The demo keeps its options in React state and builds a new instance when they change: operators can only be given at construction, `updateOptions()` merges fragments, so a fragment can't be removed, and `getOptions()` no longer reports them. The Configuration panel edits v3's options (`http`, `graphQL`, `cache`, `runtimeTypeCheck`, `strictDataPaths`), and refuses a configuration that FigTree won't construct. v2's cache persistence is gone.
    - **Storage.** Every key is prefixed `v3:`, so what the v2 playground left in the same origin's storage is never read.
    - **Evaluation.** An Evaluate button in the demo, not the library, evaluates the whole expression until the editor does it (Phase 10).
    - **npm mode.** No published editor runs on v3, so the demo no longer depends on `fig-tree-editor-react`, and the `npm` mode stops with a message naming `pnpm dev` and `pnpm demo:pack`. Restore the dependency with the first v3 pre-release.
    - **Catalogs (from 1.2): still none.** `scripts/checkPackage.mjs` packs with `pnpm pack`, which rewrites `catalog:`, but `release` publishes with `npm publish`, which doesn't.
    - **Tests and CI.** jest, ts-jest and the demo's only test (`src/test/utils.test.ts`, which nothing ran, for a helper this rewrite removes) are gone, with the unused `setupTests.ts` and v1-era `testExpressions.ts`. The demo gains a `typecheck` script, and CI runs it and the demo's lint. The demo also picks up JER v2's prop renames (`baseFontSize`, `"when-collapsed"`), which typechecking surfaced.

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

Done (September 2026). The design is in [v3-design.md](v3-design.md), topics 1 to 8, with the per-kind breakdown in [v3-node-anatomy.md](v3-node-anatomy.md) and the mockups listed in [artifacts.md](artifacts.md). Phases 4 onwards were revised to match. Two things stay open by design: where the result display sits, settled by trying it in Phase 10, and fragment-definition mode, parked (topic 6). Upstream changes are in [v3-upstream.md](v3-upstream.md); F1, the one marked Required, was filed as [fig-tree-evaluator#199](https://github.com/CarlosNZ/fig-tree-evaluator/issues/199) and shipped in fig-tree 3.0.0-preview.2.

## Phase 4 — Foundations

Each phase from here builds what [v3-design.md](v3-design.md) specifies; the design is the reference for the detail, and these steps order the work.

This phase builds what every node relies on, and ends with every definition in place behind a placeholder component, so the classification can be checked against the demo's expressions before any FigTree UI exists.

- **4.1 · Dependencies.** Move `json-edit-react` to `peerDependencies` (0.3, as revised), with `check:package`'s consumer installing it as a peer. Move fig-tree to the first release with F1 in [v3-upstream.md](v3-upstream.md), which is Required: the classification walk reads each object and string through fig-tree's own functions.
  - fig-tree done: both `package.json` files are on `^3.0.0-preview.2`, which ships F1 along with F3 to F7 and F11 to F13 ([#198](https://github.com/CarlosNZ/fig-tree-evaluator/issues/198), [#199](https://github.com/CarlosNZ/fig-tree-evaluator/issues/199) and all of [#200](https://github.com/CarlosNZ/fig-tree-evaluator/issues/200) but F8). The checks pass, and every demo expression still validates with no issues.
  - json-edit-react done: it is a peer at `^2.0.1` and a devDependency at the same range, and `@json-edit-react/utils` stays a regular dependency. `check:package` needed no change, since its consumer already links every declared peer, so the packed copy imports, `require()`s and typechecks against json-edit-react as a peer. The checks pass.
- **4.2 · The props, display data, theming and wording.**
  - The props type from topic 8's summary, carrying only the props that work by the end of this phase. The rest join it in the phase that gives them behaviour, so no prop is accepted and ignored.
  - The four groups over json-edit-react's props: the Replaced ones left out of the type, the Combined ones merged with the editor's, and the editor's defaults (topic 8, "How the props relate to json-edit-react's").
  - Display data in its layers, with the `operatorHints` and `categoryHints` props and the derived colour for host operators without their own (topic 8, "Display overrides"). A pure module with its own tests, since the starting-value rule (4.5) reads seeds from it.
  - `editorTheme` and the theme layering ("Theming and CSS"), and the standalone `./style.css`.
  - One module holding every user-visible string ("Wording").
  - Done.
    - **The props type** omits the whole Replaced group, each checked by a `@ts-expect-error` in the component tests. It adds `operatorHints`, `categoryHints` and `editorTheme`. 4.4 took the last two out again until a component uses them (below). `SetExpressionOptions` joins in 4.5.
    - **The Combined group:** only `className` and `theme` have an editor value to combine with so far. The others pass through until the phase that gives the editor its own, which adds its combinator.
    - **The editor defaults** are v1's: `showArrayIndexes: false`, `indent: 2`, `collapse: 2`, `stringTruncateLength: 100`.
    - **Display data** is `src/displayData.ts`, with its tests. `literal` is added to the operators, since `getOperators()` doesn't list it. A hint the host sets to `undefined` leaves the layers beneath it in place. Fragments' fallbacks apply where they are drawn. The derived colours use the design's 18% and 65%, which reach 11.7:1 to 12.7:1 across the core categories, tested against 4.5:1.
    - **`editorTheme`** is `src/editorTheme.ts`, with `defaultEditorTheme` exported. The components will apply the values inline (design, "Theming and CSS"). json-edit-react's `theme` is layered as `[editorLayer, ...hostTheme]`, with the editor's layer empty until 4.4's style functions.
    - **`./style.css`** is the injected text, minified by the same function, and is published as `build/style.css`. `STYLESHEET` in `scripts/entries.mjs` declares it, and the build checks its `exports` entry. `check:package` resolves it in the consumer and compares it with the source. v1's rules are pruned from the stylesheet, which keeps `Select` and the issues list.
    - **Wording** is `src/strings.ts`: English strings under their `FT_…` keys, with no translation mechanism.
    - **The size budget** is 10 kB for now.
- **4.3 · The classification walk.** The path-to-kind map, each row's slot and each node's scope chain, in one top-down walk per update (topics 1 and 4). A pure module with its own tests, including the parity test against `inspect()`.
  - Done. It isn't called from the component yet; 4.4 wires it in, where its output is used.
    - **The walk** is `classify(expression, { operators, fragments })` in `src/classify.ts`. It returns a map keyed by json-edit-react's `toPathString`, with `rowAt(map, path)` to look a row up. A row with no entry is plain data. Each entry can hold the row's kind (with form, names, a fragment call's arguments mode and a reference's namespace), a payload role (`flattened` or `unlabelled`) on `$name` rows and static `parameters` rows, `filtered` on `operator` and `fragment` rows, its slot, and its scope chain.
    - **Slots** are `src/slots.ts`, with the design's `Slot` type. `Path` is in `src/paths.ts`.
    - **fig-tree 3.0.0-preview.3** ships F14 ([fig-tree-evaluator#201](https://github.com/CarlosNZ/fig-tree-evaluator/issues/201)): `singlePositionalTarget` from `./format`, and `recognizeReference` with the `as` bindings in scope, which the walk passes from its scope chain. Both `package.json` files are on `^3.0.0-preview.3`. The editor's stand-ins for them, briefly in `src/upstream.ts`, are gone.
    - **Settled in building:**
      - An unknown operator's or fragment's parameters are walked as undeclared, admitting `any`, where the compiler stops, so the nodes inside them still show as nodes.
      - A malformed object (`classifyObject`'s `malformed`) is marked by the kind its keys suggest, carrying the message, and isn't walked.
      - A reference-shaped string that `recognizeReference` rejects (`'$vars'`) is a reference marked `invalid`, so it can take its namespace's colour beside its error.
      - A literal-only slot (`as`, `useCache`) is recorded but its value isn't read.
      - A literal array is a list of elements only where its parameter's type takes an array. Elsewhere (`if.then: [1, 2]`) it's plain data.
      - Plain data's `ownerPath` is the nearest enclosing node, or null outside any node. A var's is the node or object holding the block. A field's declaration is its `elementShape` entry.
      - The dead modifiers on a `literal` aren't walked.
    - **Tests:** `test/classify.test.ts` covers the anatomy doc's shapes, the contexts and the scope chains. `test/slots.test.ts` covers the slot table.
    - **The parity test** compares the map with `inspect()` on 17 anatomy shapes and the demo's nine expressions, which `test/fixtures.ts` copies with a registry like the demo's. Disabling binding recognition fails it, so it catches drift.
- **4.4 · Every definition, behind placeholders.**
  - The definitions of topic 1's "Node shapes and their definitions", as [v3-node-anatomy.md](v3-node-anatomy.md) lists them: nodes, flattened payloads, leaves, the unlabelled copies and the rows `filterChildren` removes, in first-match order, each condition reading the path-to-kind map.
  - Each component is a placeholder: a border labelled with the row's kind, around the child rows, or around the original node (`passOriginalNode`) for a leaf. So the demo's expressions show the classification, along with the definitions' own flags (`showCollectionWrapper`, `showKey`).
  - `customNodeDefinitions` keeps its identity while the map's content is unchanged (topic 1, finding 6).
  - How components reach the editor's shared state: the `FigTree` instance, the map, the display data, the merged `editorTheme` and the strings. Display data and the theme keep their identity while their content is unchanged, compared with fig-tree's `deepEqual`, so a host's inline objects and an in-place registry change cost nothing until the content changes.
  - Each later phase replaces placeholders with their components.
  - Done.
    - **The definitions** are `customNodeDefinitions(shared)` in `src/customNodeDefinitions.ts`, in first-match order. The unlabelled copies of Operator, Fragment, Shorthand, Literal and Reference come first, from the design's `unlabelledVariants` helper. Then come Container (root only), Comment (a `//` array, no key), Comment line (a `//` string or a line of one, found by its parent's row, since the lines are quoted), Flattened payload, and a catch-all for unlabelled plain values and argument lists. Each condition is a lookup in the walk's map.
    - **Shared state** reaches the components through each definition's `componentProps`, json-edit-react's documented route: the `FigTree` instance, the classification and the display data. The strings are a module import.
    - **Identity:** the component classifies the expression and builds the display data on every render, and `useStableValue` (`src/useStableValue.ts`, fig-tree's `deepEqual`) keeps each one's identity while its content is unchanged. The definitions are memoised on them, so the array keeps its identity through an edit that changes no row's kind, slot or scope, which the tests check.
    - **The placeholders** (`src/Placeholder.tsx`, one component for every definition, agreed with Carl) keep json-edit-react's own rendering: the child rows for a node, and the original node (`passOriginalNode`) for a leaf. Around it they add a thin border and a small absolutely positioned label, one colour per definition, so the tree lays out as it would without them. The label names the kind, the name as written, the display name and the state: unknown, malformed, a fragment's arguments mode, a reference's namespace and binding, and whether the row is an unlabelled copy. A flattened payload's label sits on its bottom edge, clear of its node's. They drop the filtered rows, as the real components will. The labels are temporary, so they aren't in `strings.ts`.
    - **Seen in the demo**, on its expressions and on a test expression with every shape. The definitions' own flags show as designed: the `operator` and `fragment` rows are gone, flattened payloads lose their header and brackets, and unlabelled rows lose their key. A flattened payload's rows keep json-edit-react's indent for now, which the theme removes later (topic 1, finding 7), and nodes keep their brackets.
    - **Props:** each definition has one colour, so the display data's colours and `editorTheme` have nothing to draw yet. `categoryHints` and `editorTheme` leave the props type, and `defaultEditorTheme` leaves the exports, until a component uses them: `categoryHints` in Phase 5 (a host operator's derived colour, the picker's groups), and `editorTheme` with the first component that applies one of its values. Their modules and tests stay. `operatorHints` stays, read by the labels' display names and by 4.5's seeds.
    - **Theme style functions** (brackets hidden on nodes, reference colours, modifier keys, the vars block) come with the components that need them, from Phase 5.
    - **Tests:** `test/customNodeDefinitions.test.tsx` renders each shape and checks every placeholder's definition and label in order, the dropped and unlabelled keys, and that every reference in the demo's expressions is marked. It also checks the array's identity across a content edit and a kind change.
- **4.5 · The fill-in step.** Complete, clean and order (topic 2, "The fill-in step"): completion on load written with `setExpression`'s `autoUpdate` marker, the rows it filled recorded for Phase 10's markers, cleaning only on structural actions, and key order with `positionalParams` first (topic 4). Not called "validate" (fig-tree's `validate()` already has the name). With it, the starting-value rule for declared parameters, including the defaults never at their effective default (topic 4, "Adding parameters and starting values"). Both are pure modules with their own tests. It comes before the operator picker (5.3), because switching operator is a structural action.
  - Done. Named `fillAndTidy`, for its two halves.
    - **The starting-value rule** is `getStartingValue(parameter, declaration, seeds)` in `src/getStartingValue.ts`: the seed, otherwise a value for the declared type, then moved off the effective default for a boolean or literal union. It returns a copy, so the tree never shares an object with the display data. Its tests are the design's table, row by row.
    - **The fill-in step** is `fillAndTidy(expression, context, { clean })` in `src/fillAndTidy.ts`. It returns the expression and the paths it filled, and finds nodes through the classification walk, so quoted content is never touched.
      - **Fill:** a full node or named payload gains a key, and an argument list gains trailing positions, with every position before the last required one. A single value that can't hold a later required position becomes an argument list, staying in positional form (agreed with Carl). A static fragment call gains its required arguments, creating `parameters` if it has none (agreed with Carl). A `literal` gains its `value`. The typo guard reads `validate()`'s `unknown-node-key` suggestions by the object holding the key, which is the same rule on all four node forms.
      - **Order:** `//`, then `operator` or `fragment`, then the parameters (`positionalParams` first, then declared order), then unknown keys as written, then `fallback` and `useCache`, then `vars`. A shorthand node is `//`, `$name`, then the modifiers. A named payload and a static call's arguments follow the declared order.
      - **Clean**, only on the node at the `clean` path: switching operator, fragment or node type, and creating a node, pass it. Adding a parameter and converting don't, since they make nothing obsolete (agreed with Carl, and topic 2 reworded to match). The operator picker (5.3) is its first caller. 5.3 moves cleaning into its own `cleanNode`, run by the component before it commits.
      - **Unchanged input** comes back as the same object, and so do untouched subtrees. Every demo expression settles in one pass.
    - **Wiring:** `setExpression` takes `SetExpressionOptions` (`{ autoUpdate?: boolean }`, exported). Every json-edit-react edit is filled and tidied before it reaches the host, as one unmarked write. An expression arriving from outside is shown filled and tidied, and is written back once with `{ autoUpdate: true }` if that changed it. One that needs nothing produces no write. The `filled` paths aren't stored yet: Phase 10 stores them for its marker.
    - **The demo** sends `autoUpdate` writes to `useUndo`'s `replace` and saves in `setExpression` rather than `onUpdate`. Loading an incomplete expression there fills it in and leaves Undo disabled.

At the end of this phase the demo shows every expression with each row's kind marked, and loading an incomplete expression completes it.

## Phase 5 — The full operator node

The `operator` definition and its unlabelled copy (4.4) take the real component, with `showOnEdit: true` and `passOriginalNode: true`. The pieces, each named for what it does:

- **The Operator component**, which drops the filtered `operator` row and shows the DisplayBar, the toolbar or the raw-JSON editor above the child rows.
- **A hook for the two editors and the commit semantics** (which editor is open, the snapshot, commit and reopen, the revert), shared later by the fragment call (Phase 7) and `literal` (Phase 9). It replaces v1's `useCommon`.
- **The DisplayBar and the toolbar**, shared with the fragment call.
- **The operator picker**, over two pure modules with their own tests: the picker's options (groups, `keywords`, "Not valid here", the spelling hint), and switching operator (the spelling rule, then cleaning the node).
- **A hover card**, a popover that the parameter cards (6.5) reuse.
- **The theme's first style functions:** brackets hidden on node rows, and the node border.

Out of scope, though the DisplayBar and toolbar leave room for them: "Add parameter" (6.2), the node-type switch (7), "To shorthand" (8), and Evaluate with the collapsed ▶ (10). So 5.1's hover-only control is the pencil alone (agreed with Carl).

- **5.1 · The operator node.** The Operator component, anchored on the object, with the DisplayBar: the Evaluate button showing the name as written (evaluation itself is Phase 10), the display name linked to `docUrl`, the operator's hover card, and hover-only controls (topic 3). The broken state (topic 7, "Where issues attach"). The collapsed summary.
  - **Issues reach components through `componentProps`**, like the rest of `Shared`: a pure module, `attachIssues(issues, classification)`, applies topic 7's rule once (the row at an issue's path, or the nearest drawn ancestor) and returns the issues by drawn row, keyed by `toPathString`, with its own tests. It keeps its identity while its content is unchanged (`useStableValue`), and the definitions are memoised on it, so an edit that changes no issue re-renders nothing extra. An edit that does change one re-renders every row, which is accepted: Phase 10's tint on plain rows comes from the theme's style functions, and a new theme re-renders every row anyway, since json-edit-react passes `getStyles` to each row as a prop. A React context was rejected: it would re-render only the editor's components, which saves nothing once the theme re-renders the tree, and it goes around json-edit-react's route for configuration (agreed with Carl). 5.1 reads it for the broken state, and 5.3 for F3's suggestion; Phase 10 reads it for everything else.
  - **`editorTheme` returns to the props**, with the broken state's `error` colour, and `categoryHints` with the picker's groups and a host operator's derived colour (4.4).
  - **The collapsed summary** is the editor's `customText` (`ITEMS_MULTIPLE` and `ITEM_SINGLE`, with `showCollectionCount: 'when-collapsed'`), so `customText` gains its combinator, the host's entry applying where the editor's returns `null` (topic 8).
- **5.2 · Two editors and the toolbar.** One definition owning both editors, proved on this node first, with json-edit-react's raw-JSON editor composed as `originalNode` (J2; topic 2, "Two editors per node"). The toolbar commits each action with `setValue` and reopens the session; ✗ and Esc commit the snapshot ("Commit semantics"). The handle's `confirm()` and `cancel()` behave as topic 8 describes.
  - **The session, as json-edit-react 2.0.1 runs it** (topic 2, "Commit semantics", has the detail): ✓ and Enter call `handleEdit()`, whose untouched raw-JSON buffer commits as a no-op and closes the session; ✗ and Esc commit the snapshot and don't reopen. The ✓ button takes `editConfirmRef`, so the handle's `confirm()` clicks it, and the handle's `cancel()` and a displacement need nothing from the editor. The component resets its editor state whenever `isEditing` turns false. The reopen after each action is synchronous, in the same handler as `setValue`, so the component never renders between the close and the reopen and needs no guard. A test checks that the toolbar stays mounted across an action.
  - **A host `onUpdate` that calls `hold()` closes the toolbar after each action**, since json-edit-react doesn't open a session while a commit is held. Accepted for now, as rare, and recorded on J10 in [v3-upstream.md](v3-upstream.md), whose fix would let the component reopen once the commit settles.
- **5.3 · The operator picker.** The `Select` changes (topic 4, "Changes to `Select`"), then the picker: category groups, `keywords`, "Not valid here" from the slots (with fig-tree's `typesIntersect`, F6), the spelling toggle and its hint, and `literal`'s entry. Switching operator cleans and completes the node through the fill-in step (4.5).
  - **First, cleaning moves out of `fillAndTidy`** into its own pure module: `cleanNode(node, declaration)` removes the keys a node's operator or fragment doesn't declare, keeping `//` and the modifiers, and a fragment call's undeclared arguments and `useCache`. It works on that node's own keys only, plus a fragment call's static `parameters`, and never recurses, since everything beneath is already filled. `fillAndTidy` loses its `clean` option, which nothing in `src/` passes, and 4.5's cleaning tests move to `cleanNode`'s own.
  - **The component cleans the switched node and commits it:** `setValue(cleanNode(switched, operator))`. The fill in `setData` then completes and orders it, as it does every edit. So the host's `onUpdate` sees the node cleaned but not yet completed, as it sees every edit before the fill; `setExpression`, the undo step and the ✗ snapshot, taken from the tree when the toolbar opens, see the finished node (agreed with Carl). Keeping cleaning apart from the fill also keeps the typo guard away from it: the fill's `validate()` runs after the unknown key is gone, so no suggestion holds a parameter back. In one pass, `{ operator: 'if', condition: true, thn: 'x', values: [1] }` would lose `thn` and still hold back `then`. Rejected: running `fillAndTidy` on the node alone with `clean`, which walks and validates a subtree that is already filled, and meets that guard problem; a ref telling `setData` where to clean, which is a side channel; calling `setExpression` directly, which is v1's `buildOnEdit`; and a `setValue` option passed through to `setData`, which is json-edit-react API for one caller.
  - **Later callers use it the same way:** creating a node (6.3), which cleans a host's `defaultOperators` node, and switching fragment or node type (Phase 7).
  - **Re-selecting the current operator toggles its spelling without cleaning**, since only the name changes and nothing is made obsolete: a plain `setValue`.
- Host operators registered with `defineOperator()` work with no special handling. A test in the picker's suite and a check in the demo cover it.

## Phase 6 — Parameters

- **6.1 · Starting values.** The rule for a new array element (topic 4, "Adding parameters and starting values"), and `defaultOperators` (topic 8). The rule for declared parameters is 4.5's.
- **6.2 · Adding parameters.** The toolbar's "Add parameter" and json-edit-react's ＋ through `newKeyOptions` and `defaultValue`, offering the same list.
- **6.3 · The type dropdown.** `allowTypeSelection` from each row's slot, with the reference entries and Operator and Fragment where they fit (topic 4, "The type dropdown"). A new node's picker opens on it (topic 2, "Node lifecycle").
- **6.4 · Guards.** Deleting, adding and renaming, including array constraints (topics 2 and 4). Dragging is disabled until J4 lands.
- **6.5 · Parameter hover cards,** on every definition at a parameter row and the catch-all (topic 4, "Parameter metadata").

## Phase 7 — Fragments

- The fragment call, static and dynamic, with `FragmentHints` display (topics 1, 3 and 6), and its broken state.
- The fragment picker, `defaultFragment`, switching fragment, and the node-type switch between operator, fragment and value (topics 2 and 6).
- Fragment-definition mode stays parked (topic 6): nothing here depends on it.

## Phase 8 — Shorthand forms and references

- Shorthand nodes, named and positional, with the flattened and unlabelled definitions (topic 1, "Node shapes and their definitions"), the dashed border, and the value on the button's line (topic 3).
- The conversion button cycling full, named and positional, and "To get node" and back (topic 1, "Conversions").
- References: the Leaf definitions, one per namespace, with `editorTheme`'s colours, the inline ▶ and `editOnTypeSwitch` (topics 3, 4 and 5).

## Phase 9 — `vars`, comments and `literal`

- The vars block through the theme, proving the tint and rule, and a new var opening for editing (topic 5).
- Comments, single and multi-line, never starting collapsed (topic 5).
- `literal`, full and shorthand, with its seed (topic 5).

## Phase 10 — Diagnostics and evaluation

- **10.1 · Diagnostics.** Issues on rows (tint, flag, the collapsed roll-up), the filled-in marker and its fade, and the messages area in tree order with its quick fixes and `messagesMaxHeight`, replacing Phase 2's plain list (topic 7). `onStatusChange` and the handle's `reveal` (topic 8).
- **10.2 · Sub-tree evaluation.** The pure module that builds the wrapped expression and maps paths back, with its own tests against fig-tree (topic 7, "Sub-tree evaluation").
- **10.3 · Evaluating.** Every Evaluate affordance, one evaluation at a time with cancel, disabled while errors block it, the result display (settling its placement by trying it), failures and the fallbacks that fired, and the failed-row marker (topic 7). The evaluation props and callbacks (topic 8, "Evaluation"). The demo's own Evaluate button (2.3) goes.
- The trace views and a dependencies view are do-later (topic 7).

## Phase 11 — Release prep

- Delete `v1-src/`.
- README (including the version-alignment policy, theming with `editorTheme` and `theme`, and wiring `useUndo` with `autoUpdate`), CHANGELOG, and a migration note for v1 consumers: the renamed and removed props (the summary at the end of topic 8 in [v3-design.md](v3-design.md)), `Select`'s groups as labels only, fig-tree no longer re-exported, and json-edit-react as a peer.
- Rewrite `CLAUDE.md` for the v3 architecture.
- Cut `v1.x` from `main` for future 1.x patches, then merge `v3.0-dev` into `main`.
- Restore the demo's `deploy` script (disabled in 0.6), then deploy the demo, replacing the live v2 playground in step with the fig-tree 3.0.0 release.
- Run `demo:pack` against the packed tarball, then publish 3.0.0. Remove `"private": true` from `package.json` first, if an earlier pre-release hasn't already.

---

## Upstream changes

Tracked in [v3-upstream.md](v3-upstream.md).
