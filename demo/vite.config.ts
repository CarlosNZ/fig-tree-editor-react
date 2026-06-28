import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: 'https://carlosnz.github.io/fig-tree-evaluator/',
  resolve: {
    alias: [{ find: /^@fig-tree-editor-react$/, replacement: figTreeEditorSrcMap[provider] }],
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
    // level up from the demo (../src, ../build, ../pack-output).
    fs: { allow: [path.resolve(__dirname, '..')] },
  },
})
