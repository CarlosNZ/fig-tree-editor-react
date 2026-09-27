import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Demo source imports the library as `@fig-tree-editor-react` — the `@` prefix
// flags it as a build-time alias rather than the real npm package. This config
// rewrites that alias to one of the sources below, selected by the
// VITE_FIG_SOURCE env var (set by the package.json scripts):
//   npm   – the published package in node_modules (default; what gets deployed)
//   local – the library's raw TypeScript source (../src) for live dev / HMR
//   build – the rollup output (../build/index.esm.js)
//   pack  – an extracted `npm pack` tarball (../pack-output/.../package)
type PackageOption = 'npm' | 'local' | 'build' | 'pack'

const provider: PackageOption = (process.env.VITE_FIG_SOURCE as PackageOption) ?? 'npm'

console.log(`Using fig-tree-editor-react from: ${provider}`)

const figTreeEditorSrcMap: Record<PackageOption, string> = {
  npm: 'fig-tree-editor-react', // no-op replacement → resolves through node_modules
  local: path.resolve(__dirname, '../src'),
  // Point at the ESM file, not the dir: `build/` has no package.json for Vite to resolve.
  build: path.resolve(__dirname, '../build/index.esm.js'),
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: 'https://carlosnz.github.io/fig-tree-evaluator/',
  resolve: {
    alias: [
      { find: /^@fig-tree-editor-react$/, replacement: figTreeEditorSrcMap[provider] },
      ...evaluatorAliases,
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
    // fig-tree-evaluator checkout beside the repo.
    fs: {
      allow: [
        path.resolve(__dirname, '..'),
        ...(evaluatorProvider === 'local' ? [evaluatorRoot] : []),
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
          'chakra-vendor': ['@chakra-ui/react', '@emotion/react', '@emotion/styled', 'framer-motion'],
          'editor-vendor': ['json-edit-react', 'fig-tree-evaluator', 'fig-tree-editor-react'],
        },
      },
    },
  },
})
