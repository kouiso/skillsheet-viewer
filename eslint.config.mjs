import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import unusedImports from 'eslint-plugin-unused-imports';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      '.next/',
      'dist/',
      'tests/',
      '*.cjs',
      'node_modules/',
      '.git/',
      'src/lib/aspida/**',
      'storybook-static/',
      'playwright-report/',
      'test-results/',
      'prisma/**',
      '.storybook/**',
    ],
  },

  {
    name: 'node-scripts',
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    ...js.configs.recommended,
  },

  {
    name: 'typescript-react/main',
    files: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        NodeJS: 'readonly',
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier: prettier,
      import: importPlugin,
      'unused-imports': unusedImports,
      'jsx-a11y': jsxA11y,
      react: react,
      unicorn: unicorn,
      sonarjs: sonarjs,
      security: security,
    },
    rules: {
      'prettier/prettier': 'error',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      ...reactHooks.configs.recommended.rules,

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-no-bind': [
        'error',
        {
          ignoreRefs: true,
          allowArrowFunctions: true,
          allowFunctions: false,
          allowBind: false,
          ignoreDOMComponents: true,
        },
      ],
      'react/require-default-props': 'off',
      'react/jsx-props-no-spreading': 'off',
      'react/jsx-indent': ['error', 2],
      'react/jsx-one-expression-per-line': 'error',
      'react/jsx-curly-newline': 'error',
      'react/jsx-wrap-multilines': 'error',
      'react/function-component-definition': [
        2,
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],

      'jsx-a11y/label-has-associated-control': 'off',

      'import/extensions': [
        'error',
        'ignorePackages',
        {
          '': 'never',
          js: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never',
          mjs: 'never',
        },
      ],
      'import/prefer-default-export': 'error',
      'import/no-default-export': 'off',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'object', 'type', 'index'],
          'newlines-between': 'always',
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: 'react**',
              group: 'external',
              position: 'before',
            },
            {
              pattern: 'next**',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
              position: 'before',
            },
          ],
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            '**/*.test.{ts,tsx}',
            '**/*.spec.{ts,tsx}',
            '**/*.stories.{ts,tsx}',
            '**/test/setup.ts',
            '**/test/**/*.ts',
            '**/test/util.tsx',
          ],
          optionalDependencies: false,
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase',
              message: 'Use "firebase" from "@/lib/firebase" instead',
            },
            {
              name: 'firebase/app',
              message: 'Use "firebase/app" from "@/lib/firebase" instead',
            },
            {
              name: 'firebase/firestore',
              message: 'Use "firebase/firestore" from "@/lib/firebase" instead',
            },
            {
              name: 'firebase/auth',
              message: 'Use "firebase/auth" from "@/lib/firebase" instead',
            },
            {
              name: 'axios',
              message: 'Use "axios" from "@/service/api/index" instead',
            },
            {
              name: 'aspida',
              message: 'Use "aspida" from "@/service/api/index" instead',
            },
          ],
          patterns: ['^@chakra-ui', '^react-icons'],
        },
      ],

      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
        },
      ],

      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'unused-imports/no-unused-imports': 'error',

      'unicorn/better-regex': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-query-selector': 'error',
      'unicorn/prefer-dom-node-text-content': 'error',
      'unicorn/new-for-builtins': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-for-loop': 'error',
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/filename-case': 'off',
      'unicorn/no-anonymous-default-export': 'off',

      'sonarjs/cognitive-complexity': ['error', 20],
      'sonarjs/no-duplicate-string': ['error', { threshold: 5 }],
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/prefer-immediate-return': 'error',

      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-unsafe-regex': 'error',

      'no-console': [
        'warn',
        {
          allow: ['error'],
        },
      ],

      'no-useless-constructor': 'error',
      'max-depth': ['error', { max: 2 }],
      complexity: ['error', { max: 10 }],
      'no-warning-comments': [
        'warn',
        {
          terms: ['fixme'],
          location: 'start',
        },
      ],
      'no-magic-numbers': [
        'error',
        {
          ignore: [0, 1],
          ignoreArrayIndexes: true,
        },
      ],
      'no-underscore-dangle': ['off', { allowAfterThis: false }],
      'no-param-reassign': 'error',
      'no-alert': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'no-plusplus': 'error',
      'function-paren-newline': ['error', 'consistent'],
      'no-confusing-arrow': 'error',
      'object-curly-newline': ['error', { consistent: true }],
      'operator-linebreak': [
        'error',
        'before',
        {
          overrides: {
            '=': 'after',
          },
        },
      ],
    },
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
        },
      },
    },
  },

  {
    name: 'firebase-axios-orval/override',
    files: ['src/lib/firebase/*', 'src/lib/axios/*', 'src/lib/orval/*'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  {
    name: 'next-app-router/override',
    files: ['src/app/**/page.tsx', 'src/app/**/layout.tsx'],
    rules: {
      'react/function-component-definition': 'off',
      'import/no-default-export': 'off',
    },
  },

  {
    name: 'trpc-routers/override',
    files: ['src/server/routers/**/*.ts', 'src/trpc/**/*.{ts,tsx}'],
    rules: {
      'import/prefer-default-export': 'off',
      'no-magic-numbers': 'off',
    },
  },

  eslintConfigPrettier,
];
