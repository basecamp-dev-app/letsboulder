# Offline Pack v2 Integrity And Migration

Status: implemented Phase 2 contract
Reader version: 2
Digest algorithm: SHA-256

This document describes the authoritative device-local Pack v2 format and lifecycle. The approved product guarantees and non-goals remain in [Offline Field Guide Product Contract](offline-product-contract.md).

## Deterministic Manifest

`CragPackManifest` in `types/crag-pack-manifest.ts` is the wire format. It records schema version 2, minimum reader version 2, stable pack/crag/climb/sector/image/route-line IDs, deterministic content version, generation time, canonical path, all required offline routes, exact required byte total, and complete metadata relationships.

Each asset records an immutable URL/content key, media type, exact byte count, `sha256:<64 lowercase hex>` digest, required/optional classification, owning image ID, and sorted owning climb IDs. Lightweight topo WebP assets are required. Detail variants are optional and do not contribute to verification or the exact required byte total.

The server fetches each immutable media response and computes size and SHA-256 from its raw response bytes. A database checksum or hash embedded in a URL is never substituted for the delivered content digest. Arrays are identity-sorted and object keys are canonicalized before hashing the snapshot. `generatedAt` is derived from the latest source timestamp and is not wall-clock time, so equivalent source content and bytes produce equivalent integrity metadata and `contentVersion`.

Manifest generation fails when a route-bearing image has no required lightweight topo. The reader rejects unsupported schema/reader versions, invalid totals, malformed digests, missing sectors, dangling route lines, incomplete asset ownership, or incomplete route inventory before staging.

## Download, Verification, And Activation

Pack v2 uses `packs-v2`, `versions-v2`, `assets-v2`, `jobs-v2`, and `migrations-v2` stores in the `letsboulder-offline-packs` IndexedDB database. Immutable media remains in `letsboulder-offline-immutable-v1`; ownership is recorded per pack version and URL.

The sequence is:

1. Parse compatibility and relationship metadata before any durable write.
2. Check incremental required bytes against browser quota.
3. Create a staging version while leaving the active pointer unchanged.
4. Fetch each required asset, reject non-success/opaque/wrong-media responses, hash raw bytes, and compare the exact byte count and SHA-256.
5. Checkpoint only matching bytes and digest in IndexedDB.
6. Recheck that every required ownership record is verified and matches its manifest metadata.
7. Atomically activate the new version, mark the former active version retained, and complete the durable job.
8. Keep the retained version until the new active version is read successfully. Only then remove retained ownership records and delete cache entries that have no remaining owners.

Interruption, quota failure, corruption, incompatible content, or termination leaves the active pointer unchanged. Queued, downloading, and resumable failed jobs survive restarts. Permanent integrity failures require an explicit retry or discard. Repair re-reads every required cached response, recomputes bytes and SHA-256, and downloads a replacement for every failed check; cache presence alone is never sufficient.

## States

The authoritative states are Not saved (`not-saved`), Downloading (`downloading`), Verifying (`verifying`), Verified (`verified`), At risk (`at-risk`), Needs repair (`needs-repair`), Update failed (`update-failed`), and Unsupported (`unsupported`). The UI renders these meanings and uses “Verified on this device” only after v2 activation in a supported installed-PWA context. A normal browser tab displays Unsupported even when the stored integrity state is verified; it may disclose that integrity checks passed but makes no field-use reliability claim.

The old internal values `installing`, `ready`, `degraded`, and `error` remain accepted only as typed Pack v1 migration inputs. They map respectively to Downloading, Needs repair pending online migration, Needs repair, and Needs repair/Not saved. They are never emitted by Pack v2 writes and can never establish Verified readiness.

Missing IndexedDB ownership metadata, missing Cache Storage responses, byte mismatch, or digest mismatch changes an active v2 pack to Needs repair. A failed staged update uses Update failed while the prior verified active version remains readable. Storage persistence/pressure is reported separately and can promote readiness to At risk without invalidating intact content.

## Non-Destructive Pack v1 Migration

The version-1 stores (`packs`, `versions`, `assets`, and `jobs`) are read-only migration inputs. Database version 2 creates separate v2 stores and never upgrades, deletes, or overwrites a legacy record.

When online startup finds an active legacy public crag pack, it records a migration attempt, fetches the current Pack v2 manifest, and runs the normal staging, byte/digest verification, and activation path. Attempts are keyed by pack ID and may be repeated safely. Durable migration states distinguish not started (absence of a record), staging, verified, activated, opened, failed, and rolled back. The active legacy record remains recoverable through interruption and after v2 activation; first successful v2 open completes the attempt. Authentication changes do not participate in either public pack store.

A legacy pack cannot be called Verified because its cached bytes lack trustworthy Pack v2 integrity metadata. Without connectivity it remains readable through the compatibility reader and is shown as Needs repair with an online-migration explanation. Reconnecting resumes migration from authoritative current content; unverifiable legacy bytes are never copied or checkpointed as verified.

## Failure And Rollback

Failed first installs retain no active v2 pointer. Failed updates retain the previous active version. Incompatible manifests are rejected before staging. If a newly activated version cannot be opened, its retained predecessor remains available for rollback; cleanup cannot collect active or retained versions. Cache garbage collection asks IndexedDB whether any active, retained, or staging ownership remains before deletion, so media shared by versions or packs survives.

Phase 3 still owns the dedicated lightweight field-guide shell and final individual-climb UI. Phase 5 still owns measured payload optimization and budget enforcement; Pack v2 records the exact evidence those phases require.
