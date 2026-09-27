import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import commentLength from 'eslint-plugin-comment-length'

// Flat config (ESLint 9). Type-aware: rules that need type info
// (await-thenable, no-floating-promises, prefer-nullish-coalescing, the
// no-unsafe-* family) are powered by the lint-only `tsconfig.eslint.json`.
// Formatting is owned by Prettier (.prettierrc.js); the only length rules here
// are for comments, which Prettier never wraps. The comment-length setup
// matches fig-tree-evaluator's.
export default tseslint.config(
  // Excluded: the build output, the demo (its own package, with its own
  // config), packed tarballs, and the frozen v1 reference source.
  { ignores: ['build/', 'demo/', 'pack-output/', 'coverage/', 'v1-src/'] },
  {
    // The repo's own tooling (rollup config, scripts/) is plain JS run by
    // Node.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    plugins: { 'comment-length': commentLength },
    rules: {
      // `//` comments: enforced + auto-fixable (reflow) via plugin. Its
      // multi-line sibling is NOT used — it mangles non-JSDoc /* blocks.
      'comment-length/limit-single-line-comments': ['error', { maxLength: 80 }],
      // Block-comment lines: enforced (not auto-fixable) via core max-len.
      // `code` is set high so Prettier (100) stays the authority on code
      // width. Unbreakable literals are exempt: an SVG path in Icons.tsx runs
      // past 200.
      'max-len': [
        'error',
        {
          code: 200,
          comments: 80,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // new JSX transform (tsconfig jsx: react-jsx)
      'react/prop-types': 'off', // types come from TypeScript, not prop-types

      // `v1-src/` is reference only (see docs-dev/v3-plan.md): nothing in the
      // library may import from it.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)v1-src(/|$)',
              message: 'v1-src/ is reference only and must not be imported.',
            },
          ],
        },
      ],

      // Hooks — exhaustive-deps is the safety net for hand-written dependency
      // arrays (warn, so it guides without blocking).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Correctness rules worth enforcing.
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }], // auto-fixable
      '@typescript-eslint/prefer-nullish-coalescing': 'warn', // auto-fixable

      // `checksVoidReturn: false` allows async event handlers (`onClick={async
      // ...}`) — a standard React allowance; the conditional/spread checks
      // stay on.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],

      // Permit the idiomatic `cond && fn()` / `cond ? fn() : null` call style.
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],

      // Ignore intentionally-unused destructures: `_`-prefixed names and props
      // pulled out of a `{ ...props }` spread to deliberately drop them.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],

      // Explicit `any` is used deliberately at the JER boundary (see
      // CLAUDE.md); surface as a warning, consistent with the unsafe-* family
      // above.
      '@typescript-eslint/no-explicit-any': 'warn',

      // The `as unknown as ...` casts and JER's broad `any`-typed surface are
      // intentional here (see CLAUDE.md), so the unsafe-* family is surfaced as
      // warnings rather than blocking errors.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',

      // Intentionally off: pedantic rules that fight this codebase's idioms.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  }
)
