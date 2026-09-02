# Documentation

Use this index to find the authoritative description of each subsystem. Code and committed Supabase migrations remain the final source of truth; update the corresponding document when behavior changes.

## How To Navigate

- Start with `app/` for a URL or page, then follow the owning `features/<domain>/` directory.
- Start with `app/api/` and `docs/api/routes.md` for an HTTP endpoint. Keep route handlers thin when the behavior belongs to a feature server module.
- Start with `supabase/migrations/` for database behavior. `types/database.ts` is generated from the local schema and must not be edited manually.
- Start with `apps/media-worker/` for Cloudflare Worker behavior; it is an independent package with its own dependency installation and typecheck.
- Start with `tests/` to find executable contracts. Test suffixes and suite boundaries are documented in [Testing](testing/README.md).

When documentation and implementation disagree, verify the implementation and tests first, then update the document and its drift check rather than introducing a second convention.

## Start Here

| Topic | Document | Source of truth |
|---|---|---|
| Product and quick start | [README](../README.md) | `package.json`, `.nvmrc`, `.env.example` |
| Local environment | [Local Setup](../LOCAL_SETUP.md) | `supabase/config.toml`, environment schemas |
| Contribution and verification | [Contributing](../CONTRIBUTING.md) | `package.json`, CI workflows |
| System topology and ownership | [Architecture](architecture.md) | App entrypoints and deployment configuration |

## Product Systems

| Topic | Document | Source of truth |
|---|---|---|
| Draft intake and publication | [Submission Workflow](submission-workflow.md) | `app/submit`, `features/submissions`, promotion migrations |
| Reusable submission UI | [Submission Controls](ui/submission-controls.md) | Component props and tests |
| Image ingest and delivery | [Media Pipeline](media-pipeline.md) | Upload handlers and `apps/media-worker` |
| Moderation and verification | [Moderation](moderation.md) | Moderation actions, media readiness, database policies |
| Trust and content governance | [Trust And Content Governance](trust-and-content-governance.md) | Publication status, public eligibility, metrics, and processing register |
| Auth, CSRF, and rate limits | [Auth And Security](auth-security.md) | Auth clients, CSRF helpers, rate-limit configuration |
| Content Security Policy | [CSP](security/csp.md) | `next.config.ts`, `lib/content-security-policy.ts` |
| Offline field-guide product contract | [Offline Product Contract](offline-product-contract.md) | Approved supported-platform, completeness, verification, and release requirements |
| Offline Pack v2 integrity and migration | [Offline Pack v2](offline-pack-v2.md) | Manifest, IndexedDB, Cache Storage, manager, migration, and reader boundaries |
| Offline physical-device release gate | [Offline Device Release Checklist](testing/offline-device-release-checklist.md) | Installed iOS and Android PWA validation records |
| Canvas, maps, GPS, grades, offline | [Patterns](patterns.md) | Feature hooks and platform utilities |

## Reference

| Topic | Document |
|---|---|
| Database schema and cascade behavior | [Database Schema](db/schema.md) |
| Migration workflow | [Database Migrations](db/migrations.md) |
| Route Handler inventory | [API Routes](api/routes.md) |
| Test suites and prerequisites | [Testing](testing/README.md) |
| Feature directory conventions | [Feature Structure](feature-structure.md) |
| Dependency overrides | [Dependency Overrides](dependency-overrides.md) |

Run `bash docs/verify.sh` after documentation, route, script, or rate-limit changes.
