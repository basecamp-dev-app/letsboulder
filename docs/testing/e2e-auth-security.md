# E2E Auth Security

The Playwright authenticated suite uses a test-only endpoint at `/api/test/[segment]/auth`.

## Endpoint Contract

- **Method**: POST only (GET returns 404).
- **Path**: `/api/test/{TEST_AUTH_PATH_SEGMENT}/auth` — the segment is a UUID known only to CI.
- **Body**: JSON with `api_key` and either `user_id` or `email`.
- **Headers**: `x-test-auth: 1` required; `x-internal-test-key` required for non-localhost.
- **Env gate**: `ENABLE_TEST_AUTH_ENDPOINT=true` must be set or the endpoint returns 404.
- **Segment gate**: URL segment must match `TEST_AUTH_PATH_SEGMENT` env var.

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
- Authenticated runs require `TEST_API_KEY`, `TEST_USER_ID`, `TEST_USER_PASSWORD`, and `TEST_AUTH_PATH_SEGMENT` in CI and on the target app environment.
- The route handler is excluded from production builds via webpack replacement and blocked by middleware.
