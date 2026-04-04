# Feature Directory Structure

## Standard Pattern

Every feature under `features/` MUST follow this directory structure:

```
features/<feature-name>/
├── components/    # React components owned by this feature
│   ├── index.ts   # Barrel export
│   └── *.tsx
├── hooks/         # Custom React hooks
│   ├── index.ts   # Barrel export
│   └── use-*.ts
├── lib/           # Pure utility functions, helpers, constants
│   ├── index.ts   # Barrel export
│   └── *.ts
├── server/        # Server actions, Supabase queries, DB logic
│   ├── index.ts   # Barrel export
│   └── *.ts
└── types/         # TypeScript types/interfaces (or types.ts)
    ├── index.ts   # Barrel export (if directory)
    └── *.ts
```

## Directory Responsibilities

| Directory | Purpose | Examples |
|-----------|---------|----------|
| `components/` | UI components specific to this feature | Feature forms, displays, layouts |
| `hooks/` | Custom React hooks | Data fetching, state management, event handlers |
| `lib/` | Pure functions, constants, validators | Formatters, parsers, config constants |
| `server/` | Server-only code | Server actions, Supabase queries, auth guards |
| `types/` | TypeScript type definitions | Feature-specific interfaces, enums, type guards |

## Rules

1. **All five directories MUST exist** in every feature, even if empty (add an `index.ts` barrel export)
2. **Server code MUST stay in `server/`** — never import Supabase client directly in components
3. **Use `@/features/<name>/...`** imports — never relative imports across features
4. **Barrel exports** — each directory should have an `index.ts` that re-exports its contents
5. **`types.ts` file** — if a feature has only 1-2 types, a single `types.ts` at the feature root is acceptable

## Compliance

Run `npx tsx scripts/check-feature-compliance.ts` to check all features and print a compliance table.
The script exits with code 1 if any feature is non-compliant.

CI enforces compliance via `npm run lint:features`.
