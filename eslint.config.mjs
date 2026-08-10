import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import localRules from './eslint-rules/index.js'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['tests/**'],
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
  {
    files: [
      'tests/**/*.{ts,tsx,js,jsx,mjs,cjs}',
      'global-setup.ts',
      'playwright.config.ts',
      'scripts/**/*.{ts,tsx,js,jsx,mjs,cjs}',
      'workers/**/*.{ts,tsx,js,jsx,mjs,cjs}',
      'apps/media-worker/**/*.{ts,tsx,js,jsx,mjs,cjs}',
      'components/DevBrowserLogger.tsx',
      'components/WebVitalsReporter.tsx',
      'lib/errors.ts',
      'lib/media/upload-debug.ts',
      'lib/performance/server-timing.ts',
      'lib/supabase-admin.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['public/sw.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
  {
    files: ['app/**/*.{ts,tsx,js,jsx}'],
    ignores: ['app/api/**'],
    plugins: {
      'local-rules': localRules,
    },
    rules: {
      'no-restricted-imports': 'off',
      'local-rules/no-cross-route-app-imports': 'error',
      'local-rules/no-service-role-import': 'error',
    },
  },
  // Restrict getAdminClient to audited paths (API routes, server modules, offline)
  {
    files: [
      'app/api/**/*.{ts,tsx}',
      'features/submissions/server/**/*.{ts,tsx}',
      'features/crags/server/**/*.{ts,tsx}',
      'lib/offline/**/*.{ts,tsx}',
    ],
    plugins: {
      'local-rules': localRules,
    },
    rules: {
      'local-rules/no-service-role-import': 'off',
    },
  },
  // Apply no-service-role-import rule to other server contexts
  {
    files: [
      'features/submissions/actions/**/*.{ts,tsx}',
      'features/crags/actions/**/*.{ts,tsx}',
    ],
    plugins: {
      'local-rules': localRules,
    },
    rules: {
      'local-rules/no-service-role-import': 'error',
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
  // Enforce consistent feature directory structure
  {
    files: ['features/**/*.{ts,tsx}'],
    plugins: {
      'local-rules': localRules,
    },
    rules: {
      'local-rules/consistent-feature-structure': 'warn',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'supabase/.temp/**',
     'next-env.d.ts',
  ]),
])

export default eslintConfig
