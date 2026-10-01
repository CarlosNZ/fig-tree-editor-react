/**
 * The package's entry points, as the build sees them. One list, read by
 * rollup.config.mjs for the build's inputs, by scripts/bundleSize.mjs for the
 * size report and by scripts/checkPackage.mjs for the budgets and the packed
 * package, so a new subpath is one row here plus its `exports` entry in
 * package.json — which the build checks against this list, failing when the
 * two disagree. Modelled on fig-tree-evaluator's codegen/entries.mjs.
 *
 * `name` is the output path under build/, without extension: the bundle is
 * `build/<name>.js`, its declarations `build/<name>.d.ts`. `budget` is the
 * brotli ceiling in bytes for the bundle, set from measurement plus about 5%;
 * raising one is a deliberate edit, visible in review. The bundle is the
 * editor's own code only: its dependencies and peers are external.
 */
export const ENTRIES = [{ subpath: '.', name: 'index', source: 'src/index.ts', budget: 25_700 }]

/**
 * The stylesheet the component injects, also published as a file of its own
 * (`./style.css`), as json-edit-react publishes its own. The build writes it
 * to `build/<fileName>`, and checks its `exports` entry like the others.
 */
export const STYLESHEET = {
  subpath: './style.css',
  fileName: 'style.css',
  source: 'src/styles.css',
}
