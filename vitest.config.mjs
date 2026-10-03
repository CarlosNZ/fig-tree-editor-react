import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

// Tests live in test/ and run in jsdom, so component tests can render with
// React Testing Library. Vite transforms the TSX and resolves `?inline`
// stylesheet imports natively, as it does for the demo's `local` mode, once
// `css` is on: by default vitest resolves every stylesheet to an empty string.
// Vitest only transpiles: `pnpm typecheck` checks the tests through
// tsconfig.test.json.
//
// VITE_EVALUATOR_SOURCE=local (`pnpm test:local-evaluator`) runs the tests
// against the source of a sibling fig-tree-evaluator checkout, with the same
// aliases as the demo's mode of that name (demo/vite.config.ts).
const evaluatorRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fig-tree-evaluator'
)

const localEvaluator = process.env.VITE_EVALUATOR_SOURCE === 'local'

if (localEvaluator && !fs.existsSync(path.join(evaluatorRoot, 'src/index.ts')))
  throw new Error(
    `VITE_EVALUATOR_SOURCE=local needs a fig-tree-evaluator checkout at ${evaluatorRoot}`
  )

export default defineConfig({
  resolve: {
    alias: localEvaluator
      ? [
          { find: /^fig-tree-evaluator$/, replacement: path.join(evaluatorRoot, 'src') },
          { find: /^fig-tree-evaluator\/(.+)$/, replacement: path.join(evaluatorRoot, 'src/$1') },
        ]
      : [],
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
    css: true,
  },
})
