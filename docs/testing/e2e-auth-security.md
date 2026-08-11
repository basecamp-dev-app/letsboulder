# E2E Auth Security

The Playwright authenticated suite uses a test-only endpoint at `/api/test/[segment]/auth`.

## Endpoint Contract

- **Method**: POST only (GET returns 404).
- **Path**: `/api/test/{TEST_AUTH_PATH_SEGMENT}/auth` — the segment is a UUID known only to CI.
- **Body**: JSON with `api_key` and either `user_id` or `email`.
- **Headers**: `x-test-auth: 1` required; `x-internal-test-key` required for non-localhost.
- **Env gate**: `ENABLE_TEST_AUTH_ENDPOINT=true` must be set or the endpoint returns 404.
- **Segment gate**: URL segment must match `TEST_AUTH_PATH_SEGMENT` env var.
- **Production gate**: `VERCEL_ENV=production` always returns 404, even if the endpoint is enabled accidentally.

## Required Environment Scoping

- Set `TEST_API_KEY`, `TEST_USER_PASSWORD`, and `TEST_AUTH_PATH_SEGMENT` only in pre-production environments.
- Never set `ENABLE_TEST_AUTH_ENDPOINT=true` in production.
- Keep `TEST_USER_ID` tied to a dedicated test account.

## Operational Safety

- Rotate `TEST_API_KEY` if there is any suspicion of leakage.
- Keep pre-production data sanitized when possible.
- Secrets are sent in the POST body and headers, never in URL query strings.

## CI Notes

- Public and authenticated Playwright projects run separately.
- Public smoke runs receive no authentication, service-role, internal, test-user, or Cloudflare credentials.
- Authenticated runs require `TEST_API_KEY`, `TEST_AUTH_PATH_SEGMENT`, `TEST_USER_PASSWORD`, and either `TEST_USER_ID` or `TEST_USER_EMAIL` in CI and on the target app environment.
- CI accepts only the exact production origin (`https://letsboulder.com`) for direct public runs. Authenticated remote runs are disabled while no protected non-production origin exists. A Vercel deployment ID is resolved through the Vercel API and accepted only when it belongs to `VERCEL_PROJECT_ID` and is a preview deployment; a generic `*.vercel.app` URL is never accepted directly.
- The URL validator accepts an origin only: HTTPS is required, and userinfo, ports, paths, queries, and fragments are rejected. The resolved origin is written to the GitHub step output rather than interpolating the requested value into shell or JavaScript source.
- Workflow values are passed through environment variables and validated before use; they are not interpolated into JavaScript or shell source.
- Builds omit the real handler through a Turbopack alias unless `ENABLE_TEST_AUTH_ENDPOINT=true` is explicitly set at build time.
- The proxy and route handler both block the endpoint when `VERCEL_ENV=production`.
