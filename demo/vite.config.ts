import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Demo source imports the library as `@fig-tree-editor-react` — the `@` prefix
// flags it as a build-time alias rather than the real npm package. This config
// rewrites that alias to one of the sources below, selected by the
// VITE_FIG_SOURCE env var (set by the package.json scripts):
//   npm   – the published package in node_modules (default; what gets deployed)
//           Unavailable until a v3 editor is published: see the guard below
//   local – the library's raw TypeScript source (../src) for live dev / HMR
//   build – the rollup output (../build/index.js)
//   pack  – an extracted `npm pack` tarball (../pack-output/.../package)
type PackageOption = 'npm' | 'local' | 'build' | 'pack'

const provider: PackageOption = (process.env.VITE_FIG_SOURCE as PackageOption) ?? 'npm'

console.log(`Using fig-tree-editor-react from: ${provider}`)

// No published editor runs on fig-tree v3 yet: 1.x is built for v2. So the
// demo doesn't depend on the npm package, and this mode stops with the
// alternatives.
// TO-DO: restore the dependency when the first v3 pre-release is published
// (docs-dev/v3-plan.md, 2.3)
if (provider === 'npm')
  throw new Error(
    'No v3 fig-tree-editor-react is published yet, so the demo has no npm mode. ' +
      'Run `pnpm dev` (the library source) or `pnpm demo:pack` (the packed build) from the repo root.'
  )

const figTreeEditorSrcMap: Record<PackageOption, string> = {
  npm: 'fig-tree-editor-react', // no-op replacement → resolves through node_modules
  local: path.resolve(__dirname, '../src'),
  // Point at the ESM file, not the dir: `build/` has no package.json for Vite to resolve.
  build: path.resolve(__dirname, '../build/index.js'),
  pack: path.resolve(__dirname, '../pack-output/fig-tree-editor-react/package'),
}

// fig-tree-evaluator itself can also be swapped, independently of the editor
// source, by VITE_EVALUATOR_SOURCE:
//   npm   – the package in node_modules (default)
//   local – the raw TypeScript source of a sibling checkout
//           (../../fig-tree-evaluator/src), for developing both together
// The alias applies to every importer, including the editor, so there is
// still a single copy of fig-tree. It is meant to pair with the editor's
// `local` mode, since a published editor was built against a released
// fig-tree.
type EvaluatorOption = 'npm' | 'local'

const evaluatorProvider: EvaluatorOption =
  (process.env.VITE_EVALUATOR_SOURCE as EvaluatorOption) ?? 'npm'

const evaluatorRoot = path.resolve(__dirname, '../../fig-tree-evaluator')

console.log(`Using fig-tree-evaluator from: ${evaluatorProvider}`)

if (evaluatorProvider === 'local' && !fs.existsSync(path.join(evaluatorRoot, 'src/index.ts')))
  throw new Error(
    `VITE_EVALUATOR_SOURCE=local needs a fig-tree-evaluator checkout at ${evaluatorRoot}`
  )

// Each package entry point (`fig-tree-evaluator`, `fig-tree-evaluator/format`,
// etc.) maps to the matching directory under src/, whose index.ts vite
// resolves.
const evaluatorAliases =
  evaluatorProvider === 'local'
    ? [
        { find: /^fig-tree-evaluator$/, replacement: path.join(evaluatorRoot, 'src') },
        { find: /^fig-tree-evaluator\/(.+)$/, replacement: path.join(evaluatorRoot, 'src/$1') },
      ]
    : []

// json-edit-react can be swapped the same way, by VITE_JER_SOURCE:
//   npm   – the package in node_modules (default)
//   local – the raw TypeScript source of a sibling checkout
//           (../../json-edit-react/src), to try a change before publishing it
// `@json-edit-react/utils`, which the demo imports, comes from the same
// checkout (packages/utils/src), so that it imports the same json-edit-react.
type JerOption = 'npm' | 'local'

const jerProvider: JerOption = (process.env.VITE_JER_SOURCE as JerOption) ?? 'npm'

const jerRoot = path.resolve(__dirname, '../../json-edit-react')

console.log(`Using json-edit-react from: ${jerProvider}`)

if (jerProvider === 'local' && !fs.existsSync(path.join(jerRoot, 'src/index.ts')))
  throw new Error(`VITE_JER_SOURCE=local needs a json-edit-react checkout at ${jerRoot}`)

const jerAliases =
  jerProvider === 'local'
    ? [
        { find: /^json-edit-react$/, replacement: path.join(jerRoot, 'src') },
        {
          find: /^@json-edit-react\/utils$/,
          replacement: path.join(jerRoot, 'packages/utils/src'),
        },
        {
          find: /^@json-edit-react\/utils\/(.+)$/,
          replacement: path.join(jerRoot, 'packages/utils/src/$1'),
        },
      ]
    : []

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: 'https://carlosnz.github.io/fig-tree-evaluator/',
  resolve: {
    alias: [
      { find: /^@fig-tree-editor-react$/, replacement: figTreeEditorSrcMap[provider] },
      ...evaluatorAliases,
      ...jerAliases,
    ],
    // In local/build/pack modes the library + its source live outside
    // demo/node_modules. Without dedupe, vite's walk-up resolution can pick up
    // a second copy from the repo-root node_modules — a second React breaks
    // hooks/context, and a second fig-tree-evaluator / json-edit-react breaks
    // instanceof checks and editor context. Force a single copy from demo's
    // deps.
    dedupe: [
      'react',
      'react-dom',
      'fig-tree-evaluator',
      'json-edit-react',
      '@json-edit-react/utils',
    ],
  },
  server: {
    // Allow serving the library source / build / packed output that lives one
    // level up from the demo (../src, ../build, ../pack-output), and the local
    // fig-tree-evaluator and json-edit-react checkouts beside the repo.
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
        ...(evaluatorProvider === 'local' ? [evaluatorRoot] : []),
        ...(jerProvider === 'local' ? [jerRoot] : []),
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heaviest, rarely-changing vendors into their own chunks so
        // they stay cached across app-code edits (and to drop the single
        // >500 kB chunk warning). These don't reduce total download — the demo
        // is a single view that needs all of them on first paint.
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chakra-vendor': [
            '@chakra-ui/react',
            '@emotion/react',
            '@emotion/styled',
            'framer-motion',
          ],
          'editor-vendor': ['json-edit-react', 'fig-tree-evaluator'],
        },
      },
    },
  },
})
