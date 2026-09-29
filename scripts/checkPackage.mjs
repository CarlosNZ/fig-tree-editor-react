/**
 * `pnpm check:package` — the packaging checks that need the built package.
 * Run after `pnpm build`, in CI and in `pnpm release`. Modelled on
 * fig-tree-evaluator's codegen/checkPackage.mjs, less its tree-shaking
 * fixtures.
 *
 *  1. Size budgets: each entry's brotli size under its ceiling
 *     (scripts/entries.mjs).
 *  2. The packed package: `pnpm pack`, extracted to
 *     pack-output/fig-tree-editor-react/package/, which is also what the
 *     demo's `pack` mode runs (`pnpm demo:pack`). That copy is then installed
 *     into a temporary consumer whose node_modules holds only the package and
 *     links to the dependencies and peers it declares (plus React's types),
 *     so an import of anything undeclared fails here as it would for a real
 *     consumer. There, every entry imports by name as ESM, `require()`s from
 *     CommonJS (Node >= 22.12's require(esm)), and typechecks from
 *     TypeScript under the nodenext, bundler and legacy node resolutions,
 *     and the standalone stylesheet resolves and holds the current styles —
 *     the package as npm delivers it, which none of the other checks see.
 *
 * Every check runs and reports; the script fails at the end if any did.
 */
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { entryBrotli } from './bundleSize.mjs'
import { ENTRIES, STYLESHEET } from './entries.mjs'
import { minifyCss } from './inlineCss.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PACKAGE = MANIFEST.name
const PACK_OUTPUT = join(ROOT, 'pack-output', PACKAGE)

/**
 * What a consumer has installed beside the package: its dependencies, its
 * peers, and the types for React, which a TypeScript host of a React
 * component always has.
 */
const CONSUMER_DEPENDENCIES = [
  ...Object.keys({ ...MANIFEST.dependencies, ...MANIFEST.peerDependencies }),
  '@types/react',
]

const failures = []
const pass = (line) => console.log(`    ✓ ${line}`)
const fail = (line) => {
  failures.push(line)
  console.log(`    ✖ ${line}`)
}
const section = (title) => console.log(`\n▸ ${title}`)
const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`

const specifier = (subpath) => (subpath === '.' ? PACKAGE : `${PACKAGE}${subpath.slice(1)}`)

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' })
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`.trim())
  return result.stdout
}

// ── 1 · Size budgets ──────────────────────────────────────────────────────

section('Size budgets (brotli)')
const width = Math.max(...ENTRIES.map(({ name }) => `${name}.js`.length))
for (const { name, budget } of ENTRIES) {
  const size = entryBrotli(name)
  const line = `${`${name}.js`.padEnd(width)}  ${kB(size).padStart(9)} of ${kB(budget).padStart(9)}`
  if (size <= budget) pass(line)
  else fail(`${line} — over budget`)
}

// ── 2 · The packed package ────────────────────────────────────────────────

section('The packed package, installed as a consumer would')
const consumer = mkdtempSync(join(tmpdir(), 'fig-tree-editor-pack-'))
try {
  // Packed and extracted where the demo's `pack` mode expects it. npm
  // tarballs nest their contents under `package/`
  rmSync(PACK_OUTPUT, { recursive: true, force: true })
  mkdirSync(PACK_OUTPUT, { recursive: true })
  run('pnpm', ['pack', '--pack-destination', PACK_OUTPUT], ROOT)
  const tarball = readdirSync(PACK_OUTPUT).find((file) => file.endsWith('.tgz'))
  run('tar', ['-xzf', tarball], PACK_OUTPUT)
  rmSync(join(PACK_OUTPUT, tarball))
  pass(`packed and extracted to ${join('pack-output', PACKAGE, 'package')}/`)

  // The consumer's node_modules: a copy of the package, not a link, so Node
  // resolves its imports from here rather than from this repo, and a link to
  // each declared dependency's installed copy
  const modules = join(consumer, 'node_modules')
  cpSync(join(PACK_OUTPUT, 'package'), join(modules, PACKAGE), { recursive: true })
  for (const name of CONSUMER_DEPENDENCIES) {
    const target = join(modules, name)
    mkdirSync(dirname(target), { recursive: true })
    symlinkSync(realpathSync(join(ROOT, 'node_modules', name)), target, 'dir')
  }
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true }))
  const specifiers = ENTRIES.map(({ subpath }) => specifier(subpath))

  // Each import must be non-empty: an `exports` path to the wrong file can
  // still load a module that exports nothing
  const importAll = specifiers
    .map((spec) => `if (!Object.keys(await import('${spec}')).length) throw new Error('${spec}')`)
    .join('\n')
  writeFileSync(join(consumer, 'esm.mjs'), importAll)
  run('node', ['esm.mjs'], consumer)
  pass(`imports as ESM: ${specifiers.join(', ')}`)

  const requireAll = specifiers
    .map((spec) => `if (!Object.keys(require('${spec}')).length) throw new Error('${spec}')`)
    .join('\n')
  writeFileSync(join(consumer, 'cjs.cjs'), requireAll)
  run('node', ['--disable-warning=ExperimentalWarning', 'cjs.cjs'], consumer)
  pass(`require()s from CommonJS: ${specifiers.join(', ')}`)

  // Read through the `exports` map, as a host adding it to a shadow root
  // would, and compared with the minified source, which is also what the
  // component injects
  const stylesheet = specifier(STYLESHEET.subpath)
  writeFileSync(
    join(consumer, 'css.cjs'),
    `process.stdout.write(require('fs').readFileSync(require.resolve('${stylesheet}'), 'utf8'))`
  )
  if (run('node', ['css.cjs'], consumer) === minifyCss(join(ROOT, STYLESHEET.source)))
    pass(`resolves ${stylesheet}, matching ${STYLESHEET.source}`)
  else fail(`${stylesheet} does not match ${STYLESHEET.source}`)

  // A browser host's view: the DOM library and no @types/node, so a
  // declaration that leans on a Node type fails here. Through the `exports`
  // map (nodenext, bundler), and as the legacy `node` resolution sees the
  // package, which ignores `exports` and reads `types`. The `node` row sets
  // `allowSyntheticDefaultImports`, which the other two imply:
  // json-edit-react's declarations default-import React, as a React host's
  // config allows
  writeFileSync(
    join(consumer, 'types.ts'),
    specifiers.map((spec, i) => `import * as entry${i} from '${spec}'`).join('\n') +
      `\nexport const entries = [${specifiers.map((_, i) => `entry${i}`).join(', ')}]\n`
  )
  const resolutions = [
    { module: 'nodenext', moduleResolution: 'nodenext', via: 'the exports map, under nodenext' },
    { module: 'esnext', moduleResolution: 'bundler', via: 'the exports map, under bundler' },
    {
      module: 'esnext',
      moduleResolution: 'node',
      allowSyntheticDefaultImports: true,
      via: '"types", under resolution "node"',
    },
  ]
  for (const { via, ...resolution } of resolutions) {
    writeFileSync(
      join(consumer, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          ...resolution,
          target: 'es2022',
          lib: ['es2022', 'dom'],
          jsx: 'react-jsx',
          types: [],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        files: ['types.ts'],
      })
    )
    run(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', 'tsconfig.json'], consumer)
    pass(`typechecks through ${via}, declarations included (DOM, no @types/node)`)
  }
} catch (error) {
  fail(error.message)
} finally {
  rmSync(consumer, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} packaging check${failures.length === 1 ? '' : 's'} failed`)
  process.exit(1)
}
console.log('\nAll packaging checks passed.')
