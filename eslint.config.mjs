import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import stylistic from '@stylistic/eslint-plugin'

// Flat config (ESLint 9). Type-aware: rules that need type info
// (await-thenable, no-floating-promises, prefer-nullish-coalescing, the
// no-unsafe-* family) are powered by the lint-only `tsconfig.eslint.json`.
// Formatting is owned by Prettier (.prettierrc.js); the only stylistic rule
// here is `max-len`, which fills a gap Prettier can't (it never wraps comment
// prose).
export default tseslint.config(
  // Nothing outside src is linted by the library config: the build output, the
  // demo (its own package), and packed tarballs are excluded.
  { ignores: ['build/', 'demo/', 'pack-output/', 'coverage/'] },
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
    plugins: { '@stylistic': stylistic, react, 'react-hooks': reactHooks },
    settings: { react: { version: '18' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules, // new JSX transform (tsconfig jsx: react-jsx)
      'react/prop-types': 'off', // types come from TypeScript, not prop-types

      // Line length: code tracks Prettier's printWidth (100), but comments are
      // held to 80 — Prettier wraps code, never comment prose. Unbreakable
      // lines (URLs, strings, templates, regexes) are exempt so this never
      // fights Prettier.
      '@stylistic/max-len': [
        'warn',
        {
          code: 100,
          comments: 80,
          tabWidth: 2,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
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
      // ...}`) — a standard React allowance; the conditional/spread checks stay on.
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
