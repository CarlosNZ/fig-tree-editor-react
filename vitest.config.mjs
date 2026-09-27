import { defineConfig } from 'vitest/config'

// Tests live in test/ and run in jsdom, so component tests can render with
// React Testing Library. Vite transforms the TSX and resolves `?inline`
// stylesheet imports natively, as it does for the demo's `local` mode.
// Vitest only transpiles: `pnpm typecheck` checks the tests through
// tsconfig.test.json.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
})
