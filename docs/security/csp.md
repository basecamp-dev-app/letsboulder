# Content Security Policy

The production `script-src` intentionally excludes `'unsafe-eval'`. Development retains it for the Next.js development toolchain.

`'unsafe-inline'` remains temporarily because Next.js emits inline bootstrap and hydration scripts. Removing it without a nonce would break rendering. Next.js nonce-based CSP requires dynamic rendering, so adopting it may reduce full-route caching and must be measured against the home, crag, image, auth, and map routes before rollout.

Follow-up work is tracked in [GitHub issue #86](https://github.com/basecamp-dev-app/letsboulder/issues/86) and must verify response nonces, caching and performance, hydration, maps, Sentry, and the service worker before removing `'unsafe-inline'`.
