import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Flat config (ESLint 9) for the demo app — the Vite React + TypeScript setup.
// Non-type-checked (this is an example app, not the published library, so the
// type-aware rules the root config uses aren't worth the project-service cost).
// Only .ts/.tsx are linted, so the Node `.js`/`.cjs` glue (server, scripts) is
// left alone.
export default tseslint.config(
  // App code is .ts/.tsx; the Node-side glue (Express server, build scripts) is
  // plain JS and not part of the app lint, so it's excluded.
  { ignores: ['dist', 'node_modules', 'src/express/**', 'scripts/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // `any` in demo glue code is acceptable; surface as a warning (matches root).
      '@typescript-eslint/no-explicit-any': 'warn',
      // Ignore intentionally-unused `_`-prefixed names / rest-spread siblings,
      // matching the root config.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'none',
        },
      ],
    },
  }
)
