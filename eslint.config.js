import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/types/database.ts'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Money is integer minor units everywhere. Floating-point arithmetic on
      // leones is a defect, not a style choice.
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='round']",
          message:
            'Rounding suggests float money. Amounts are integer minor units (SLE x 100); format only at the render layer.',
        },
        {
          selector: "NewExpression[callee.name='Date']:not([arguments.length>0])",
          message:
            "new Date() is the viewer's local day, not Freetown's. Business dates come from the server — see src/types/db.ts.",
        },
      ],
    },
  },
)
