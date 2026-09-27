import { readFileSync } from 'node:fs'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import dts from 'rollup-plugin-dts'
import { collectBundleSize, printBundleSize } from './scripts/bundleSize.mjs'
import { ENTRIES } from './scripts/entries.mjs'
import { inlineCss } from './scripts/inlineCss.mjs'

// package.json must name exactly the entries built here, with the paths the
// build writes — checked before building anything
const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const declarations = (name) => `./build/${name}.d.ts`
const expected = {
  exports: Object.fromEntries(
    ENTRIES.map(({ subpath, name }) => [
      subpath,
      { types: declarations(name), default: `./build/${name}.js` },
    ])
  ),
  types: declarations(ENTRIES.find(({ subpath }) => subpath === '.').name),
}
for (const [field, value] of Object.entries(expected))
  if (JSON.stringify(manifest[field]) !== JSON.stringify(value))
    throw new Error(
      `package.json "${field}" does not match scripts/entries.mjs — expected:\n` +
        JSON.stringify(value, null, 2)
    )

// Every dependency and peer stays external, subpaths included
// (`react/jsx-runtime`, `fig-tree-evaluator/format`): the consumer installs
// them, and a bundled copy of React or fig-tree would break hooks and
// `instanceof` checks
const externals = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
const external = (id) => externals.some((name) => id === name || id.startsWith(`${name}/`))

export default [
  {
    input: Object.fromEntries(ENTRIES.map(({ name, source }) => [name, source])),
    // ESM-only, like fig-tree-evaluator v3, whose Node floor (22.12) this
    // package shares: CJS consumers on Node use require(esm), and bundlers
    // take ESM directly (docs-dev/v3-plan.md, 1.6)
    output: { dir: 'build', format: 'esm', entryFileNames: '[name].js' },
    external,
    // Compiler settings come from tsconfig.json — the single source of truth
    plugins: [inlineCss(), typescript(), terser(), collectBundleSize()],
  },
  // Bundle each entry's per-file declarations (build/dts, emitted by the pass
  // above) into one self-contained .d.ts beside its bundle
  ...ENTRIES.map(({ name, source }, i) => ({
    input: source.replace(/^src\//, './build/dts/').replace(/\.tsx?$/, '.d.ts'),
    output: { file: `build/${name}.d.ts`, format: 'es' },
    external,
    // The size report runs last, so it can weigh every declaration file
    plugins: [dts(), ...(i === ENTRIES.length - 1 ? [printBundleSize()] : [])],
  })),
]
