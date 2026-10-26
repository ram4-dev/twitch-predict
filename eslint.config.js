import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
export default tseslint.config({ ignores: ['dist/**', 'node_modules/**', 'extension/twitch.js', 'extension/model.js', 'extension/points-ui.js', 'public/points-ui.js', 'public/catalog.js', 'public/byte-ui.js', 'public/onboarding.js', 'public/consoles.js', 'public/surfaces.js', 'extension/surfaces.js', 'test-results/**'] }, js.configs.recommended, ...tseslint.configs.recommended, { languageOptions: { globals: { ...globals.node, ...globals.browser, chrome: 'readonly' } }, rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } });
