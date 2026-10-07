// @ts-check

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig({
  files: ['**/*.{js,ts}'],
  extends: [
    js.configs.recommended,
    // tseslint.configs.recommended, 
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
  ],
  rules: {
    "quotes": ["error", "double"],
    "@typescript-eslint/restrict-template-expressions": "off",
    "max-len": ["error", { "code": 140, "tabWidth": 2, "ignoreComments": true, "ignoreUrls": true, "ignoreTrailingComments": true }]
  },
  languageOptions: {
    parserOptions: {
      projectService: true,
    },
  },
});