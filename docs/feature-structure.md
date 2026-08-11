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
| `server/` | Server-only orchestration | Supabase queries, auth guards, cache invalidation |
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

### Public API Surfaces

Features may expose `public.ts` when one runtime-neutral, browser-safe barrel is sufficient. Generic public surfaces receive the same recursive client-safety checks as `public-client.ts`. Features that expose both browser-safe and server behavior MUST separate those contracts:

```
features/submissions/public-client.ts   # Components, hooks, pure helpers, erased types
features/submissions/public-actions.ts  # Curated Server Actions only
features/community/public-server.ts     # Server-only functions; imports `server-only`
```

`public.ts` and `public-client.ts` are safe to consume from either client or server code, including through their runtime dependency graphs. `public-actions.ts` only re-exports functions from modules marked `'use server'`. `public-server.ts` imports `server-only` and MUST NOT be imported by client modules. Type-only exports may use browser-safe surfaces because they are erased at runtime, and client traversal stops at modules marked `'use server'`.

### Types Alongside types/

A `types.ts` file at the feature root is acceptable alongside a `types/` directory when it holds feature-wide shared types while `types/` holds domain-specific definitions.

## Rules

1. **The standard directories should exist where the feature needs them** — directories at the feature root are preferred for feature-wide code, but nested sub-features also count toward compliance
2. **Server orchestration belongs in `server/` by default** — Server Actions are the documented exception and may use `actions.ts` or `actions/`; shared technical server utilities may live in root `lib/`
3. **Use curated public surfaces across features** — never import another feature's private modules, and features must never import route composition from `app/`
4. **Barrel exports** — each non-empty directory should have an `index.ts` that re-exports its contents when that directory exposes a public surface
5. **No dead duplicates** — `app/` should not contain copies of files that live in `features/`; use re-exports instead

## Compliance

Run `npx tsx scripts/check-feature-compliance.ts` to print the feature directory layout report. Directory layout is advisory because features only need the standard directories they use.

Run `npm run check:architecture` to enforce server isolation, `app/` ownership, and feature public APIs across alias and relative static imports, dynamic imports, and CommonJS `require()`. Client safety is checked transitively through app, feature, hook, component, and shared library modules. The checked-in baseline manifest must match existing debt exactly: new violations fail, and resolved entries must be removed. CI enforces this gate.
`npm run check:features` and `npm run lint:features` are local advisory helpers for the feature tree.
