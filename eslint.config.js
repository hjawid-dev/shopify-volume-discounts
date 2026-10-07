const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {ignores: ['**/dist/', '**/generated/', '**/node_modules/']},
  js.configs.recommended,
  {
    // The storefront widget and its demo page are plain browser scripts.
    files: ['extensions/bundle-widget/assets/**/*.js'],
    languageOptions: {sourceType: 'script', globals: {...globals.browser, module: 'readonly'}},
  },
  {
    files: ['extensions/admin-home/src/**/*.jsx'],
    languageOptions: {
      parserOptions: {ecmaFeatures: {jsx: true}},
      globals: {...globals.browser, shopify: 'readonly'},
    },
  },
  {
    files: ['*.js', 'extensions/volume-discount/*.js'],
    languageOptions: {sourceType: 'commonjs', globals: globals.node},
  },
  {
    files: ['tests/**/*.js', 'extensions/volume-discount/vitest.config.js'],
    languageOptions: {sourceType: 'module', globals: globals.node},
  },
  {
    rules: {
      // Several catch blocks are deliberate fallbacks that do not need the error.
      'no-empty': ['error', {allowEmptyCatch: true}],
      'no-unused-vars': ['error', {caughtErrors: 'none'}],
    },
  },
];
