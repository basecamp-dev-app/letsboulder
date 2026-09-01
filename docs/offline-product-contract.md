# Offline Field Guide Product Contract

Status: Approved target contract  
Phase: 0 — product contract and architecture decision  
Approved: 1 September 2026  
Owners: Product and offline platform maintainers

## Decision

letsboulder's supported offline product is a lightweight field guide for:

1. An installed iOS Progressive Web App launched from the Home Screen.
2. An installed Android Progressive Web App launched from the device launcher.

A normal browser tab, desktop browser, native application, and an installation that has never completed an online setup are outside this contract. They may continue to work, but they must not be represented as supported offline field use.

This document defines the target contract. The current implementation does not yet satisfy every acceptance criterion below. Later phases must preserve this contract or update it through an explicit product and architecture review.

## Product Promise

After a crag is saved and reported as **Verified on this device**, a climber can launch the installed PWA with no signal, open that crag, and access every required climb and topo included in the verified version.

The application must never label a guide Verified when a required metadata record, shell asset, or media asset is absent, incompatible, or fails integrity validation.

Web storage remains controlled by the operating system and browser. The application therefore promises verified completeness at the recorded verification time, continuously detects loss before presenting a guide as ready, and communicates storage risk. It does not claim immunity from operating-system eviction.

## Supported User Journeys

### Prepare while connected

1. The climber opens a crag and chooses to save it.
2. The application shows the climb count, topo count, exact expected download size, and available local storage.
3. The application installs into a staging version.
4. It verifies all required metadata, shell assets, and media assets.
5. It activates the new version only after verification succeeds.
6. It displays **Verified on this device** with the verification time.

### Verify before a trip

1. The climber chooses **Verify for trip**.
2. Verification runs without relying on a network response.
3. The application validates the active pack, every required climb, every required asset digest, reader compatibility, shell availability, and storage status.
4. The result is either Verified, At risk, or Needs repair. A partial result is never reported as Verified.

### Use without signal

1. The climber enables airplane mode or loses all connectivity.
2. They terminate and relaunch the installed PWA from the device launcher.
3. The offline library opens without a network timeout.
4. Every verified crag opens.
5. Every required climb opens through a dedicated offline route.
6. Required text, access information, coordinates, topo image, and route line render from device storage.

### Update safely

1. A verified version remains active while a new version downloads.
2. Interruption, quota failure, invalid content, or application termination cannot replace or damage the active version.
3. A new version becomes active only after complete verification.
4. The previous verified version remains recoverable until the new version has opened successfully.

## Required Crag Content

A verified crag contains:

- Stable crag identity, name, canonical path, and content version.
- Description, access notes, tide dependency, rock type, and location policy.
- Country, region, sub-area, and sector names when published.
- Policy-filtered crag or approach coordinates.
- Every active or approved public climb belonging to the crag.
- Explicit relationships between climbs, sectors, topo images, and route lines.
- A required lightweight topo for each route-bearing public face.
- Pack schema version, minimum reader version, generation time, expected byte count, and integrity metadata.

Content that is private, deleted, superseded, unapproved, or prohibited by the location policy must not enter the pack.

## Required Climb Content

Every climb in a verified crag contains:

- Stable climb identity and offline route.
- Name, slug when present, grade, consensus grade, and original grade when published.
- Route type, description, sector, verification state, and updated time.
- Policy-filtered coordinates.
- Every eligible route line associated with the climb.
- A reference to each required topo on which the climb appears.

A climb without a public topo remains accessible as a text-only climb when its published metadata is valid. The UI must state that no public topo is available; it must not treat the climb as missing.

## Explicit Non-goals

The default offline pack does not include:

- Hosted basemap tiles or a live interactive map.
- Community feeds, rankings, comments, or remote search.
- Editing, contribution, moderation, or upload workflows.
- Authentication-dependent personal data.
- Personal logbook history or queued log mutations.
- Duplicate detail and high-resolution image variants.
- Images that contain no active route line unless separately marked as required field information.

Optional high-resolution topo downloads may be added later, but they cannot be required to satisfy the default Verified state.

## Navigation Contract

The target offline shell provides deterministic device-local routes for:

- Offline library.
- Crag overview.
- Individual climb view.

A crag view must link to every required climb. A climb deep link must resolve from the active local pack without a server request. Network availability may enhance a view, but it cannot be required to construct or render the verified field guide.

## Pack And Storage Contract

A pack is installed at crag granularity. Its metadata is a self-contained snapshot with explicit required assets.

Each required asset records:

- Immutable URL or content key.
- Media type.
- Exact byte count.
- Cryptographic digest.
- Required or optional classification.
- Owning image and climb relationships.

Installation uses versioned staging and activation:

1. Create a staging version without changing the active pointer.
2. Download each required asset.
3. Verify bytes and digest before checkpointing it as complete.
4. Verify metadata completeness and reader compatibility.
5. Verify that the offline shell required to read the pack is available.
6. Activate the complete version.
7. Retain the previous verified version through first successful open.
8. Garbage-collect only unowned inactive assets.

The product has one authoritative offline metadata model. Legacy stores are read only for explicit, non-destructive migration and are removed only after the migrated version passes the same verification contract.

Crag packs contain public device-local content and survive sign-out. Authentication changes must not delete them.

## State Contract

| State | Meaning | User access |
|---|---|---|
| Not saved | No active local version exists | Online view only |
| Downloading | A staging version is incomplete | Previous verified version remains usable |
| Verifying | Required content is being checked | Previous verified version remains usable |
| Verified | All required content and the reader shell passed local checks | Full offline access |
| At risk | Content passes integrity checks, but the platform cannot attest durable storage or reports storage pressure | Offline access with a prominent risk warning |
| Needs repair | Required content is missing, corrupt, or incompatible | Available intact content may be read, but the guide is not represented as trip-ready |
| Update failed | A staged update failed | Previous verified version remains usable |
| Unsupported | The app is not running as a supported installed PWA | No reliability claim |

**Download complete** is not a readiness state. User-facing readiness language must use the states above.

## Lightweight Budgets

These are initial product guardrails for the dedicated offline field-guide surface. Phase 1 records the baseline; changes to a budget require measured evidence and an update to this contract.

- Offline shell JavaScript and CSS: no more than 200 KiB compressed in total for a cold install.
- No map renderer, remote query client, upload stack, charting library, or community feature code in the offline shell.
- Default media: one WebP topo per required route-bearing face.
- Default topo: maximum 1,600 px on the longest edge.
- Metadata: compact snapshot with no duplicate per-climb payloads.
- Installation UI: exact expected total bytes, not an estimate presented as exact.
- Cold offline launch target: interactive field-guide library within 2 seconds on the release-test Android device and supported iPhone under the documented test conditions.

If a crag exceeds an agreed device-storage threshold, the application must explain its size before download. It must not silently omit climbs to meet a budget.

## Reliability Acceptance Criteria

A release satisfies this contract only when the mandatory fixture and physical-device checks pass without an allowed offline failure.

For both supported platforms:

- Install the PWA while connected.
- Save and verify a fixture crag containing text-only climbs, multiple sectors, multiple topo faces, and shared images.
- Enable airplane mode.
- terminate the PWA process.
- Relaunch from the Home Screen or device launcher.
- Open the offline library, fixture crag, and every climb.
- Confirm all required metadata, images, and route lines render.
- Confirm no required navigation waits for a network timeout.

The suite must also prove:

- An interrupted first install never becomes Verified.
- An interrupted update preserves the active verified version.
- Missing Cache Storage media is detected before the guide is reported as Verified.
- Missing IndexedDB metadata is detected before the guide is reported as Verified.
- Digest mismatch prevents activation.
- Quota exhaustion prevents activation without damaging the active version.
- A failed service-worker installation leaves the previous shell operational.
- An incompatible reader leaves the previous compatible guide operational.
- Sign-out does not remove public crag packs.
- A successful migration preserves the old version until the migrated version is verified.

Automated offline end-to-end tests are mandatory and cannot depend on optional environment variables to run. Release-candidate testing covers the latest supported stable iOS PWA and Android Chrome PWA environments defined by the release checklist.

## Observability Contract

Offline failures must be diagnosable without requiring connectivity at the time of failure.

The application stores bounded, non-personal local events for:

- Install start, verification, activation, failure, and repair.
- Offline cold launch success or failure.
- Missing or corrupt required content.
- Storage persistence and quota state.
- Migration result.
- Pack size and duration.

Events may upload after reconnection with user-appropriate disclosure. They must not contain personal logbook activity, unpublished content, precise hidden coordinates, or raw media.

## Release Gates

Work implementing this contract proceeds in phases:

1. Contract and architecture decision.
2. Mandatory reliability harness.
3. Integrity-checked pack format and migration.
4. Dedicated lightweight field-guide shell.
5. Payload optimization and safe update lifecycle.
6. Controlled device rollout.

No phase may weaken an earlier exit gate to make a later phase pass. Any exception requires an explicit update to this document explaining the user impact and replacement guarantee.
