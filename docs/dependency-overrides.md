# Dependency Overrides

This document tracks npm overrides in `package.json` that resolve known vulnerabilities in transitive dependencies.

## Active Overrides

| Package | Version | CVE/Issue | Source | Notes |
|---------|---------|-----------|--------|-------|
| `path-to-regexp` | 8.4.0 | CVE-2026-4923 (ReDoS) | @opennextjs/cloudflare → express | Override added Mar 2026 |
| `fast-xml-parser` | ^5.5.8 | Vulnerability | @aws-sdk/core → @aws-sdk/xml-builder | AWS SDK dependency |
| `tar` | ^7.5.12 | Vulnerability | supabase JS client | |
| `flatted` | ^3.4.2 | Vulnerability | eslint → flat-cache | |
| `undici` | ^7.24.5 | CVE | jsdom, wrangler/miniflare | HTTP client |

## Rationale

Overrides are used to patch security vulnerabilities in transitive dependencies that we don't control directly. Each override corresponds to a known CVE or security issue in an older version of the package.

## Monitoring

- **Dependabot** is enabled for npm (see `.github/dependabot.yml`)
- Check Dependabot PRs weekly for updates that may allow removing overrides
- When a direct dependency updates to include the fixed version, remove the override

## Cleanup

When removing an override:
1. Update the direct dependency if needed
2. Run `npm install` and verify the transitive dependency gets the fixed version
3. Remove the override from package.json
4. Update this document