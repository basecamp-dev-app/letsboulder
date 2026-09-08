# Production Media Worker Configuration Convergence

This runbook exists only for the reviewed production Route-to-Custom-Domain migration that left the active Worker version with known legacy configuration after trigger reconciliation succeeded.

## Default rule

Production Worker version uploads use `wrangler versions upload --strict`. Do not remove that default and do not use the convergence exception for ordinary deployments.

The convergence path is a protected, manual `Media Worker Deploy` dispatch from `main`. It is disabled by default and requires both:

- `allow_known_config_convergence = true`
- `expected_main_sha = <the exact checked-out main commit SHA>`

The workflow rejects the exception outside `refs/heads/main` or when the supplied SHA does not equal `GITHUB_SHA`. The normal protected `Production` environment approval still applies.

## Preconditions

Use the exception only when all of the following are already true:

1. `CF_MEDIA_WORKER_URL` and `NEXT_PUBLIC_MEDIA_CDN_URL` in the protected GitHub `Production` environment both point to `https://static.letsboulder.com`.
2. The legacy externally managed DNS record for `static.letsboulder.com` has been removed and Cloudflare trigger reconciliation can create the Worker Custom Domain.
3. `wrangler triggers deploy --env production` succeeds and reports both `static.letsboulder.com` and the temporary `media.letsboulder.com` compatibility alias as Custom Domains.
4. The production queue consumer `media-worker-production` exists on `media-transform-queue-prod` with batch size 1, timeout 5, and retries 3.
5. A normal strict version upload still fails because the previously active Worker version contains the reviewed legacy route/variable/queue configuration being replaced by the repository configuration.

If any different or unexplained drift is present, stop and investigate it instead of enabling the exception.

## One-time convergence dispatch

After the staging-tested workflow change is promoted to `main`:

1. Open GitHub Actions → `Media Worker Deploy` → `Run workflow`.
2. Select branch `main`.
3. Set `allow_known_config_convergence` to `true`.
4. Enter the exact current `main` commit SHA in `expected_main_sha`.
5. Start the run and approve the protected `Production` environment when prompted.

The workflow must still pass, in order:

- production input validation;
- exact-main-SHA convergence authorization;
- trigger dry-run;
- actual route/domain and cron reconciliation;
- production queue consumer reconciliation;
- version upload using the reviewed incident-only non-strict path;
- post-upload trigger reconciliation;
- tagged version deployment at 100%;
- `POST https://static.letsboulder.com/enqueue` returning `401`.

Do not use Cloudflare Dashboard edits as a substitute for these workflow gates.

## Required post-convergence verification

After the convergence run succeeds, manually dispatch `Media Worker Deploy` again from the same `main` commit with `allow_known_config_convergence` left at its default `false` value. The ordinary `--strict` upload must now pass.

That strict-clean rerun is the proof that the exception is no longer required. If it fails, do not re-enable the convergence exception. Inspect the new strict diff and reconcile the remaining source of drift through a reviewed staging-first change.

The temporary `media.letsboulder.com` compatibility Custom Domain remains intentionally in place until a separate dependency audit proves that it can be removed safely.
