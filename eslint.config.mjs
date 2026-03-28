import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  // 対象外
  { ignores: ['**/node_modules/**', '**/cdk.out/**', '**/dist/**', '**/.expo/**'] },

  // ----- JavaScript (Lambda handlers, tests) -----
  {
    files: ['aws/src/**/*.js', 'aws/__tests__/**/*.js'],
    ...js.configs.recommended,
    plugins: { prettier: prettierPlugin },
    rules: {
      ...prettierPlugin.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },

  // ----- TypeScript (CDK stack, mobile-app) -----
  ...tseslint.config({
    files: ['aws/lib/**/*.ts', 'aws/bin/**/*.ts', 'mobile-app/**/*.ts', 'mobile-app/**/*.tsx'],
    extends: [tseslint.configs.recommended],
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'off',
    },
    plugins: { prettier: prettierPlugin },
  }),

  // Prettier 競合ルール無効化
  prettier,
];
