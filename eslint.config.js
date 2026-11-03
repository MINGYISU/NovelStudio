import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const TEXT_ATTRIBUTES = '/^(title|placeholder|aria-label|alt|label)$/';

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
      '_site/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The project site is plain browser JavaScript, outside the app's TypeScript build.
    files: ['site/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // I18N-09: interface text comes from the dictionaries through t(); no literal text in components.
    files: ['src/client/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXText[value=/[A-Za-z\u4e00-\u9fff]/]',
          message: 'Interface text must come from t() (src/client/i18n), not a literal.',
        },
        {
          selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > Literal[value=/[A-Za-z\u4e00-\u9fff]/]`,
          message: 'Interface text must come from t() (src/client/i18n), not a literal.',
        },
        {
          selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > JSXExpressionContainer > Literal[value=/[A-Za-z\u4e00-\u9fff]/]`,
          message: 'Interface text must come from t() (src/client/i18n), not a literal.',
        },
        {
          selector: `JSXAttribute[name.name=${TEXT_ATTRIBUTES}] > JSXExpressionContainer > TemplateLiteral`,
          message: 'Interface text must come from t() (src/client/i18n), not a template string.',
        },
      ],
    },
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
