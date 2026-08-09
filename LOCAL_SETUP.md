# Local Development Setup

This guide sets up letsboulder against the local Supabase stack. Hosted-project access is not required for normal development.

## Prerequisites

- Node.js `20.20.0` (pinned in `.nvmrc`)
- npm
- Docker or another Docker-compatible runtime

Use the lockfile-installed Supabase CLI through `npx`; do not install a separate global version.

```bash
nvm install
nvm use
npm install
npx supabase --version
```

Install Docker using the instructions for your operating system, then verify that the daemon is running:

```bash
docker info
```

## First Run

Start Supabase and rebuild the local database from committed migrations:

```bash
npx supabase start
npx supabase db reset
```

The local services normally include:

| Service | URL |
|---|---|
| API | `http://127.0.0.1:54321` |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | `http://127.0.0.1:54323` |
| Mailpit | `http://127.0.0.1:54324` |

Copy the environment template and replace the Supabase placeholders with the values printed by `npx supabase status`:

```bash
cp .env.example .env.local
npx supabase status
```

Generate local secrets for `CSRF_SECRET` and `DELETE_ACCOUNT_SECRET`. For example:

```bash
openssl rand -hex 32
```

R2 credentials are needed to exercise route-photo upload and delivery. Developers without access can run non-media areas of the application, but upload flows will not work end to end.

Generate database types and start Next.js:

```bash
npx supabase gen types typescript --local > types/database.ts
npm run dev
```

Open `http://localhost:3000`. Use the local auth screen and inspect magic links in Mailpit. Do not insert rows directly into `auth.users` or `auth.instances`; Supabase Auth owns those tables.

## Everyday Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:unit
npm run test:components
npm run test:integration
npm run build
```

Use `CONTRIBUTING.md` to choose checks for a specific change and `docs/testing/README.md` for test prerequisites, Playwright projects, database tests, and the CI-equivalent sequence.

Database work requires a current local stack:

```bash
npx supabase db reset
npx supabase gen types typescript --local > types/database.ts
npm run typecheck
npm run test:database
```

See `docs/db/migrations.md` for the schema-change workflow. Do not use hosted-project commands for normal local development.

## Admin Access

Create a user through local Supabase Auth, then elevate only its public profile in Studio after replacing the placeholder UUID:

```sql
update public.profiles
set is_admin = true
where id = '<local-auth-user-id>';
```

Never copy the example into a shared or hosted database. Authorization behavior should still be tested through the application and RLS policies.

## Media Worker

The app uploads originals directly to R2 and can notify the Cloudflare Worker through an optional fast path. The durable `media_jobs` outbox remains authoritative.

Worker-backed media testing requires access to the configured R2, Queue, and Supabase resources plus these Worker secrets:

- `INGRESS_SECRET`, matching the app's `CF_MEDIA_WORKER_SECRET`
- `INTERNAL_ORIGIN_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

The Next.js app also needs `CF_MEDIA_WORKER_URL`, `CF_MEDIA_WORKER_SECRET`, and `NEXT_PUBLIC_MEDIA_CDN_URL`. A plain `wrangler dev --env staging` creates a hybrid environment: configured Supabase URLs are hosted, but R2 and Queue bindings are local by default, so it cannot process originals uploaded to hosted staging R2. There is no fully isolated local media stack in this repository.

```bash
npm --prefix apps/media-worker run check
```

Use the deployed development environment for end-to-end media verification. Maintainers should see `apps/media-worker/README.md` and `docs/media-pipeline.md` before running remote Worker commands or deploying changes.

## Hosted Database Deployment

Only maintainers should link or push to a hosted Supabase project. Verify the selected project and always inspect a dry run first:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

Never use `db reset --linked` as part of local setup.

## Troubleshooting

### Local Supabase will not start

```bash
docker info
npx supabase status
npx supabase stop
npx supabase start
```

Check for another service using ports `54321` through `54324` if startup still fails.

### Next.js crashes or native dependencies fail

Confirm the pinned Node version and reinstall dependencies under it:

```bash
nvm use
rm -rf node_modules
npm install
```

### Authentication email does not arrive

Local email is captured by Mailpit at `http://127.0.0.1:54324`; it is not delivered to an external inbox.

### Media remains queued

Confirm the R2 variables, CDN URL, Worker URL/secret mapping, Worker bindings, and `media_jobs` state. Queue dispatch is only a fast path; the scheduled Worker must also be able to reach the configured Supabase project.

## Git Workflow

Create a feature branch and open a pull request against `main`. See `CONTRIBUTING.md` for the current branch, verification, and review conventions.
