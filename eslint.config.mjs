import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['app/**', 'tests/**'],
    rules: {
      'no-console': 'warn',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/app/**'],
              message: 'Do not import from app/** outside route files. Move reusable code into features/**, lib/**, or components/**.',
            },
          ],
        },
      ],
    },
  },
  // Enforce no-restricted-imports for @supabase/ssr in app page/component files (not API routes)
  {
    files: ['app/**/*.{ts,tsx}'],
    ignores: ['app/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/ssr',
              importNames: ['createServerClient'],
              message: 'Use getServerClient() or variants from @/lib/supabase-server',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])

export default eslintConfig
