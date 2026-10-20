import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'playwright-report/**',
      'test-results/**',
      'node_modules/**',
      '.data-dev/**',
      '.data-test/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['src/server/**/*.ts', 'scripts/**/*.mjs', '*.config.{ts,js}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/shared/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['node:*', 'fs', 'path', 'os', '**/server/**', '**/client/**'] },
      ],
    },
  },
);
