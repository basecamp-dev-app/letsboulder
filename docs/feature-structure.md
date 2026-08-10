# Feature Directory Structure

Reference for organizing product-domain code under `features/`.

## Standard Pattern

Features under `features/` generally follow this directory structure:

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

## Allowed Deviations

The following patterns are acceptable deviations from the standard structure:

### Compatibility Shims

Re-export files that preserve old import paths during code migrations. These MUST include a comment stating they are for backward compatibility and SHOULD be removed once all importers are updated.

```
features/editor/route-store-sync.ts   # → re-exports from features/submissions/lib/
features/editor/location/             # → re-exports from features/submissions/lib/
features/editor/collaboration/        # → re-exports from features/submissions/editor/
```

### Server Actions at Feature Root

Features with a small number of server actions may place `actions.ts` at the feature root instead of inside `server/`. Features with many actions should use an `actions/` directory.

```
features/comments/actions.ts
features/grades/actions.ts
features/submissions/actions/
```

### Nested Sub-Features

Large features may contain nested sub-features that follow the same structure. Sub-features need not include all five directories — only the ones they require.

```
features/admin/crags/       # admin sub-feature for crag management
features/admin/gyms/        # admin sub-feature for gym management
features/submissions/upload/
features/submissions/draft-editor/
features/submissions/submission-editor/
```

### Feature-Specific Stores

Features with complex client state may include a `store/` directory for Zustand/Redux slices.

```
features/route-editor/store/
```

### Public API Barrels

Features may expose a `public.ts` barrel to curate their public API surface.

```
features/moderation/public.ts
features/submissions/public.ts
```

### Types Alongside types/

A `types.ts` file at the feature root is acceptable alongside a `types/` directory when it holds feature-wide shared types while `types/` holds domain-specific definitions.

## Rules

1. **The standard directories should exist where the feature needs them** — directories at the feature root are preferred for feature-wide code, but nested sub-features also count toward compliance
2. **Server code MUST stay in `server/`** — never import Supabase client directly in components
3. **Use `@/features/<name>/...`** imports — never relative imports across features
4. **Barrel exports** — each non-empty directory should have an `index.ts` that re-exports its contents when that directory exposes a public surface
5. **No dead duplicates** — `app/` should not contain copies of files that live in `features/`; use re-exports instead

## Compliance

Run `npx tsx scripts/check-feature-compliance.ts` to print the feature directory layout report. Directory layout is advisory because features only need the standard directories they use.

Run `npm run check:architecture` to enforce server isolation, `app/` ownership, and feature public APIs. The gate checks source files changed since the architecture baseline; when a legacy file is touched, it must meet the current rules. CI enforces this gate.
`npm run check:features` and `npm run lint:features` are local advisory helpers for the feature tree.
