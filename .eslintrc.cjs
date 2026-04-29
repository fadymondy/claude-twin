/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: {
    node: true,
    browser: true,
    webextensions: true,
    es2022: true,
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '*.config.js',
    '*.config.cjs',
    'extension/icons/',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['extension/**/*.js'],
      parser: 'espree',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      // Content scripts run as classic scripts (manifest v3 isolated world,
      // not modules) and lean on globals attached by content/shared/*.js
      // (TwinMonitor, TwinMessenger, TwinLanguage).
      files: ['extension/content/**/*.js'],
      parserOptions: { sourceType: 'script' },
      globals: {
        TwinMonitor: 'readonly',
        TwinMessenger: 'readonly',
        TwinLanguage: 'readonly',
      },
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        'no-empty': 'off',
        'no-prototype-builtins': 'off',
        'no-inner-declarations': 'off',
      },
    },
  ],
};
