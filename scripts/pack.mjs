// Build the library, pack it exactly as `npm publish` would, and extract the
// tarball into pack-output/ so the demo's `pack` mode can resolve the real
// published form (see demo/vite.config.ts). Single-package equivalent of
// json-edit-react's scripts/pack-all.mjs.
import { execSync } from 'node:child_process'
import { readdirSync, rmSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'pack-output')
const dest = join(outDir, 'fig-tree-editor-react')

console.log('→ Building library...')
execSync('yarn build', { cwd: root, stdio: 'inherit' })

console.log('→ Cleaning pack-output...')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

console.log('→ Packing (npm pack)...')
execSync(`npm pack --pack-destination "${dest}"`, { cwd: root, stdio: 'inherit' })

const tarball = readdirSync(dest).find((f) => f.endsWith('.tgz'))
if (!tarball) throw new Error(`No .tgz produced in ${dest}`)

console.log(`→ Extracting ${tarball}...`)
// Yields pack-output/fig-tree-editor-react/package/ (npm tarballs nest under `package/`).
execSync(`tar -xzf "${join(dest, tarball)}" -C "${dest}"`, { stdio: 'inherit' })
rmSync(join(dest, tarball))

console.log('✓ fig-tree-editor-react → pack-output/fig-tree-editor-react/package/')
