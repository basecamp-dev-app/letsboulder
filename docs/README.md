# Documentation

Use this index to find the authoritative description of each subsystem. Code and committed Supabase migrations remain the final source of truth; update the corresponding document when behavior changes.

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
| Auth, CSRF, and rate limits | [Auth And Security](auth-security.md) | Auth clients, CSRF helpers, rate-limit configuration |
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
