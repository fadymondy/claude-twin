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
      // Service worker and other classic-script files aren't modules.
      files: ['extension/background/**/*.js'],
      parserOptions: { sourceType: 'script' },
    },
  ],
};
