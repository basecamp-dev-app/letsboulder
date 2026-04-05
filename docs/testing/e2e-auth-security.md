# E2E Auth Security

The Playwright authenticated suite uses a test-only endpoint at `/api/test/auth`.

## Endpoint Contract

- **Method**: POST only (GET returns 404).
- **Body**: JSON with `api_key` and either `user_id` or `email`.
- **Headers**: `x-test-auth: 1` required; `x-internal-test-key` required for non-localhost.
- **Env gate**: `ENABLE_TEST_AUTH_ENDPOINT=true` must be set or the endpoint returns 404.

## Required Environment Scoping

- Set `TEST_API_KEY` and `TEST_USER_PASSWORD` only in pre-production environments.
- Never set `ENABLE_TEST_AUTH_ENDPOINT=true` in production.
- Keep `TEST_USER_ID` tied to a dedicated test account.

## Operational Safety

- Rotate `TEST_API_KEY` if there is any suspicion of leakage.
- Keep pre-production data sanitized when possible.
- Secrets are sent in the POST body and headers, never in URL query strings.

## CI Notes

- Public and authenticated Playwright projects run separately.
- Authenticated runs require `TEST_API_KEY`, `TEST_USER_ID`, and `TEST_USER_PASSWORD` in CI and on the target app environment.
