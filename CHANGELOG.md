# Changelog

## [1.0.0-beta.5] - 2026-06-30

### Added

- Export `containsFigTreeNode` with package

## [1.0.0-beta-4] - 2026-06-30

### Changed

- Upgrade `fig-tree-evaluator` to `2.22.1`

### Fixed

- Pass the `event` argument through the evaluate function in the top-level container

## [1.0.0-beta.3] - 2026-06-30

### Changed

- Upgrade `json-edit-react` and use its filter helpers for the `allow*` predicates

### Fixed

- Fix `null` fallback value not being assigned a type

## [1.0.0-beta.2] - 2026-06-29

### Changed

- Upgrade `json-edit-react` to `2.0.0-beta.8`

## [1.0.0-beta.1] - 2026-06-29

### Fixed

- Fix plain/top-level nodes not rendering correctly

## [1.0.0-beta.0] - 2026-06-29

### Added

- Raw JSON editing of Operator nodes, alongside the structured toolbar editor

### Changed

- Upgrade to `json-edit-react` v2 (`2.0.0-beta.7`)
- Upgrade `fig-tree-evaluator` to `2.22.0`
- Rework node editing to reuse `json-edit-react`'s built-in editing session, removing the bespoke `useCurrentlyEditing` and `useUndo` hooks
- Stabilise the props passed to the underlying `<JsonEditor>`
- Tighten the ESLint config (including a comment line-length rule)

### Fixed

- Fix shorthand node rendering and editing
- Fix a style import warning
- Restore custom-node auto-open behaviour and fix several layout issues

## Older releases

- **v0.7.10**:
  - When switching Fragments, remove old fragment properties
- **v0.7.9**:
  - Switching node type (operator/fragment/custom operator) auto-focuses the operator/fragment selector menu
  - Add `addTopLevelFallback` prop
- **v0.7.8**:
  - props to set default expression, fragment and custom operator
- **v0.7.5**:
  - Fix possible infinite re-render when loading new expression
- **v0.7.1**:
  - Improve type definitions for styles input
  - Pass "event" to `onEvaluate` function
- **v0.7.0**:
  - Use updated editor package ([json-edit-react](https://carlosnz.github.io/json-edit-react/)) in order to restrict to enum values when appropriate
  - Correct defaults for all operator properties
- **v0.6.6**: Respect editing restrictions in Custom Nodes
- **v0.5.0 – v0.6.5**: Initial release
