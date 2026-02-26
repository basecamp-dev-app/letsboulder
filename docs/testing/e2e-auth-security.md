# E2E Auth Security

The Playwright authenticated suite uses a test-only endpoint at `/api/test/auth`.

## Required Environment Scoping

- Set `TEST_API_KEY` and `TEST_USER_PASSWORD` only in pre-production environments.
- Never set `ENABLE_TEST_AUTH_ENDPOINT=true` in production.
- Keep `TEST_USER_ID` tied to a dedicated test account.

## Operational Safety

- Rotate `TEST_API_KEY` if there is any suspicion of leakage.
- Keep pre-production data sanitized when possible.
- Do not log full auth URLs containing `api_key`.

## CI Notes

- Public and authenticated Playwright projects run separately.
- Authenticated runs require `TEST_API_KEY`, `TEST_USER_ID`, and `TEST_USER_PASSWORD` in CI and on the target app environment.
