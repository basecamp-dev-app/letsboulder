# Trust And Content Governance

This document defines the operational contract for public content, impact metrics, support claims, source-code claims, and privacy configuration. Code and committed migrations remain authoritative.

## Publication Contract

`crags.publication_status` is the shared boundary for public pages, canonical metadata, sitemap entries, search, map data, metrics, offline/export surfaces, and route publication destinations.

| Status | Public behavior |
|---|---|
| `draft` | Creator/steward only; never indexed |
| `review` | Creator/steward preview; never indexed |
| `published` | Eligible for public discovery when lifecycle and media checks also pass |
| `archived` | Excluded from discovery; retain audit and redirect history |

Names are never readiness evidence. `content_origin = 'fixture'` identifies fixtures, and fixture content must not be published in production. Existing active public crags were backfilled to `published` to prevent an unreviewed rollout from removing legitimate community content. Future crags default to `review`.

Publication requires a canonical slug, country code, coordinates, an active non-superseded record, and an explicit action by an administrator or assigned crag maintainer. Every transition is recorded in `crag_publication_events`.

## Ownership And Freshness

| Surface | Owner | Service level |
|---|---|---|
| Publication queue and readiness | Assigned crag maintainer; administrator escalation | Review weekly; blocking access reports within 48 hours |
| Impact definitions and SQL | Data owner | Review quarterly and with every definition change |
| Impact availability | Engineering | Hourly synthetic monitoring |
| Support cost target | Operator | Review monthly; remove rather than display stale received-support data |
| Privacy processing register | Privacy owner with legal review | Review before enabling a provider or materially changing collection |
| Error monitoring | Engineering/security owner | Review sampling and retention quarterly |

`get_public_impact_metrics_v1()` returns one atomic snapshot with `generatedAt` and `definitionVersion`. The UI must show unavailable data as unavailable, never as a fabricated zero.

## Metric Definitions: Version 1

- **Routes documented:** active or approved, non-deleted climbs belonging to a published, active crag.
- **Crags mapped:** published, active crags with coordinates.
- **Sends logged:** logbook entries recorded as top, flash, or onsight.
- **Active climbers:** distinct climbers with a qualifying send in the rolling previous 60 days.
- **Photos:** top-level, ready, approved, public guide images belonging to a published crag.
- **Contributors:** distinct people attached to a discoverable route or qualifying public photo.

Changes require a new RPC version, updated UI definitions, database tests, and a recorded product/data-owner decision.

## Support And Source Claims

The About page shows a monthly infrastructure target, not a live donation balance. A received-support progress meter may be introduced only with an owned source and verification timestamp.

The canonical source repository is `https://github.com/basecamp-dev-app/letsboulder`. User-contributed content remains governed by the Terms and Open Data Contributor Terms rather than the software licence.

## Current Processing Register

| Technology | Purpose | Current application behavior |
|---|---|---|
| Supabase cookies/session storage | Authentication and session continuity | Necessary for signed-in features |
| CSRF and redirect cookies | Request protection and auth intent | Necessary and short-lived where applicable |
| Local storage | Theme, grade, launch, and recent-item preferences | Functional storage |
| IndexedDB | Query persistence, offline packs, draft checkpoints, durable uploads | Functional/offline storage |
| Service worker/browser cache | App shell, media, and offline behavior | Functional/offline storage |
| Sentry | Production errors and performance diagnostics | Enabled in production; text masked and media blocked in replay integration; replay sampling defaults to zero |
| Vercel Analytics | Optional analytics | Package present but application client not initialized |
| Vercel Speed Insights | Optional performance analytics | Not installed or initialized |

Legal/privacy review must precede any optional analytics or replay enablement and decide lawful basis, consent/opt-out behavior, regions, payloads, IP handling, retention, subprocessors, and transfer safeguards. The Cookie and Privacy pages must be updated in the same change as processing behavior.

## Monitoring And Rollback

Monitor for non-published sitemap URLs, indexable missing/review pages, search/sitemap/map eligibility drift, metric RPC failures, stale support claims, and telemetry not present in the processing register.

Publication migrations are additive and retain historical data. Application readers can be rolled back independently, but rollback must never mass-publish review records or remove audit events. Revalidate public crag paths, the Impact page, and one-hour sitemap caches after approved transitions.
