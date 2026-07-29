# Open Data Exports

letsboulder publishes a signed, machine-readable snapshot of factual public climbing data each night. These exports are intended for bulk reuse; they are separate from the application API and media pipeline.

## License And Scope

The dataset is available only under the [Open Database License 1.0 (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). The export contains database facts such as identifiers, names, grades, relationships, privacy-safe locations, and route geometry. It does not contain photos, image URLs intended to recover photos, user profiles, logs, votes, private records, free-form descriptions, comments, condition reports, or other expressive text. Application source code remains under its repository license; that license does not replace the ODbL for exported data.

The export is provided as-is. Locations, access status, names, grades, and route lines may be incomplete, approximate, stale, or wrong. Consumers must independently assess legality, access restrictions, hazards, landowner rules, and climbing safety; the dataset is not navigation or safety advice.

## Artifact Layout

The public base URL contains immutable dated snapshots and small mutable discovery files:

```text
v1/latest.json
v1/minisign.pub
v1/snapshots/2026-07-29/<run-id>/manifest.json
v1/snapshots/2026-07-29/<run-id>/manifest.json.minisig
v1/snapshots/2026-07-29/<run-id>/crags.jsonl.gz
v1/snapshots/2026-07-29/<run-id>/crags.geojson.gz
v1/snapshots/2026-07-29/<run-id>/sectors.jsonl.gz
v1/snapshots/2026-07-29/<run-id>/routes.jsonl.gz
v1/snapshots/2026-07-29/<run-id>/route-lines.jsonl.gz
v1/snapshots/2026-07-29/<run-id>/tombstones.jsonl.gz
v1/annual/2026/latest.json
v1/annual/2026/<run-id>/...same signed snapshot artifact set...
```

Each `.jsonl.gz` data file is gzip-compressed UTF-8 JSON Lines: one JSON object per line. `crags.geojson.gz` is a gzip-compressed EPSG:4326 GeoJSON FeatureCollection using `[longitude, latitude]` coordinate order and omitting crags without publishable coordinates. `manifest.json` identifies the UTC export date, generation time, semantic schema version, source revision (`GITHUB_SHA`), ODbL license, coordinate policy, signing-key path, row counts, byte sizes, media types, and SHA-256 digest of every data artifact. Artifact paths are relative to the manifest directory, so the same signed set remains self-contained when preserved under the annual prefix. The verification example derives a standard `SHA256SUMS` file from these signed manifest checksums. The practical field contract below is authoritative for schema version 1.0.0.

`v1/latest.json` is an unsigned mutable pointer containing the newest successfully published snapshot ID and unique run ID plus nested manifest and signature paths, URLs, and the manifest digest. Resolve it for discovery, then fetch and verify the referenced manifest; never treat the pointer itself as proof of integrity. Every run directory is immutable. A failed partial run remains unreferenced, and a retry writes a new run directory, so generations can never be mixed. `v1/annual/YYYY/latest.json` is created once and identifies that year's retained signed set.

## Record Schemas

All records use stable UUID strings for `id` and foreign keys. Dates and timestamps are ISO 8601 strings in UTC. Nullable fields are JSON `null`, not empty strings. Every listed field is present. Text-like fields are strings, count/index/dimension/coordinate fields are finite JSON numbers, and verification fields are booleans unless nullable is stated.

| File | Required v1.0.0 fields |
|---|---|
| `crags.jsonl.gz` | `id`, `name`, `slug`, `country_code`, `country_id`, `country`, `region_id`, `region_name`, `sub_area`, `rock_type`, `type`, `tide_dependency`, `location_visibility`, `latitude`, `longitude`, `created_at`, `updated_at` |
| `sectors.jsonl.gz` | `id`, `crag_id`, `name`, `created_at` |
| `routes.jsonl.gz` | `id`, `effective_climb_id`, `crag_id`, `sector_id`, `shared_climb_id`, `name`, `slug`, `grade`, `grade_index`, `consensus_grade`, `original_grade_string`, `route_type`, `location_visibility`, `latitude`, `longitude`, `is_verified`, `verification_count`, `created_at`, `updated_at` |
| `route-lines.jsonl.gz` | `id`, `climb_id`, `sequence_order`, `color`, `image_width`, `image_height`, exact stored `points`, nullable `points_normalized`, `source_coordinate_system`, and creation timestamp; no image identifier, object, or URL is exported |
| `tombstones.jsonl.gz` | `entity_type`, `id`, `deleted_at`, `superseded_by`; mirrors can remove or supersede deleted crags/routes without receiving deletion reasons |

Non-null fields are: crags `id`, `name`, `slug`, `country_code`, `location_visibility`; sectors all fields; routes `id`, `effective_climb_id`, `crag_id`, `grade`, `location_visibility`; route lines `id`, `climb_id`, `points`, `source_coordinate_system`; tombstones `entity_type`, `id`, `deleted_at`. Every other listed field is nullable. UUID fields use canonical UUID strings. `entity_type` is `crag` or `route`; `location_visibility` is `exact`, `approximate`, or `hidden`; `source_coordinate_system` is `normalized` or `legacy_image_space`. Latitude is bounded to `[-90,90]`, longitude to `[-180,180]`, and normalized x/y values to `[0,1]`. `points` contains at least two finite `{x:number,y:number}` objects; `points_normalized` is either the same-length normalized array or `null`.

Location semantics are explicit per record:

| `location_visibility` | Coordinates | Meaning |
|---|---|---|
| `exact` | Present when available | Published at the available precision. It may still be inaccurate and is not a survey coordinate. |
| `approximate` | Reduced-precision crag coordinates; route coordinates may be `null` | Deliberately reduced precision. A route inherits its parent crag's approximate area and must not expose a more precise point. |
| `hidden` | `null` | Withheld. Consumers must not infer, reconstruct, or join other export fields to reveal it. |

Route-line points are image-local topo geometry, not geographic coordinates or a GPS track. `points` preserves the finite stored `{x,y}` pairs. When all source points are in the inclusive `[0,1]` range, `source_coordinate_system` is `normalized` and `points_normalized` repeats those values. Otherwise the source is marked `legacy_image_space` and `points_normalized` is `null`; the exporter deliberately does not guess whether historical values used pixels, a rendered canvas, or offsets. Do not place route-line points directly on a map, and do not assume geometry from different source canvases shares a coordinate system.

## Verify A Snapshot

Download the public key once through a trusted project channel and compare its key ID with the announced key ID before relying on it. The following example resolves `latest.json`, verifies the signed immutable manifest, then checks artifact digests:

```bash
base_url='https://data.example.org'
latest=$(curl --fail --silent --show-error "$base_url/v1/latest.json")
manifest_url=$(jq -r '.manifest.url' <<<"$latest")
signature_url=$(jq -r '.signature.url' <<<"$latest")
snapshot_url=${manifest_url%/manifest.json}

curl --fail --remote-name "$base_url/v1/minisign.pub"
curl --fail --output manifest.json "$manifest_url"
curl --fail --output manifest.json.minisig "$signature_url"
minisign -Vm manifest.json -p minisign.pub

jq -r '.files[] | "\(.sha256)  \(.path | split("/") | last)"' manifest.json > SHA256SUMS
jq -r '.files[].path' manifest.json | while IFS= read -r path; do
  curl --fail --remote-name "$snapshot_url/$path"
done
sha256sum --check SHA256SUMS
gzip --test ./*.jsonl.gz
gzip --test crags.geojson.gz
```

Do not execute URLs or filenames from an unverified manifest. Use HTTPS, enforce download and decompression limits, reject duplicate JSON keys if the consumer's parser permits them, validate each row against the versioned contract above, and ingest into a new staging dataset before atomically replacing a known-good local copy.

## Versioning And Retention

`schema_version` follows semantic versioning (`MAJOR.MINOR.PATCH`). A major release may remove or reinterpret fields. A minor release may add optional fields or enum values. A patch release clarifies constraints without changing compatible record meaning. Consumers should pin a supported major version, tolerate unknown fields and enum values where safe, and fail closed rather than silently misinterpreting a newer major version.

Daily run directories under `v1/snapshots/` are retained for 90 days. The workflow preserves the first successful complete snapshot of each year under `v1/annual/YYYY/<run-id>/` and creates an immutable `v1/annual/YYYY/latest.json` pointer; both are retained indefinitely. Cloudflare R2 lifecycle configuration is an external production prerequisite, not configured by this workflow: expiration rules must delete eligible daily snapshot objects after 90 days while exempting `v1/annual/`, `v1/latest.json`, and `v1/minisign.pub`. Operators must test lifecycle filters against representative keys before enabling them.

## Production Provisioning

Use a dedicated R2 bucket and a dedicated token restricted to object read/write/list operations on that bucket. Do not reuse media bucket credentials. Configure the protected GitHub `Production` environment with:

| Kind | Name | Purpose |
|---|---|---|
| Secret | `PUBLIC_DATA_EXPORT_DATABASE_URL` | TLS PostgreSQL URL for a dedicated read-only export login |
| Secret | `OPEN_DATA_R2_ACCESS_KEY_ID` | Dedicated open-data bucket token ID |
| Secret | `OPEN_DATA_R2_SECRET_ACCESS_KEY` | Dedicated open-data bucket token secret |
| Secret | `OPEN_DATA_MINISIGN_PRIVATE_KEY` | Passwordless CI signing key; preserve newlines |
| Secret | `OPEN_DATA_MINISIGN_PUBLIC_KEY` | Matching public key; the workflow publishes or verifies the stable copy |
| Variable | `OPEN_DATA_R2_ENDPOINT` | R2 S3 API endpoint |
| Variable | `OPEN_DATA_R2_BUCKET` | Dedicated bucket name |
| Variable | `OPEN_DATA_PUBLIC_BASE_URL` | HTTPS public origin for published objects |

Provision a dedicated PostgreSQL login outside migrations and store its generated password only in the environment secret. Grant it `CONNECT` and membership in the versioned, no-login `public_data_export_reader` role; the exporter must explicitly assume that `NOINHERIT` role. Do not put the login or its password in a migration, grant it directly to source tables, or configure broad default privileges. It must not own objects, bypass RLS, inherit elevated roles, or use a Supabase service-role key. Verify the versioned views with the export login itself before enabling the schedule.

Configure the matching Minisign public key in GitHub and publish its fingerprint through a different trusted channel. The workflow creates `v1/minisign.pub` when absent and fails if an existing stable key differs; key rotation therefore requires an explicit operator procedure rather than silent replacement. Restrict private-key and R2-token access to required production reviewers and jobs. Rotate database and R2 credentials by creating and validating replacements, updating GitHub secrets, running a manual export, then revoking old credentials. Rotate a compromised signing key immediately, publish the new public key and fingerprint out of band, retain the old public key for historical verification, and document the validity boundary.

## Operation And Recovery

The workflow runs at `02:30 UTC` and uses the protected `Production` environment. A single concurrency group prevents overlapping exports, and an in-progress export is never canceled by a newer run. It validates configuration without printing values, runs script typechecking and unit tests, signs the manifest, and publishes through `npm run export:public-data`.

Publication is atomic from a consumer's perspective: generate and validate all files locally, upload data artifacts and the signed immutable manifest, and update `latest.json` only after every immutable object succeeds. Any failure before the final pointer update leaves the previous `latest.json` in place. A failed run must exit nonzero; operators should inspect GitHub Actions logs and R2 objects without exposing credentials. Unreferenced partial objects are not a successful snapshot and may be removed only after confirming no immutable manifest references them.

After fixing a transient or configuration failure, use **Run workflow**, optionally set `export_date` to the missed UTC date in `YYYY-MM-DD`, approve the Production environment, and monitor the run. A historical backfill is published under a new run ID but cannot move `latest.json` backward. After recovery, resolve `latest.json`, perform the signature/checksum procedure above, compare row counts with the prior snapshot, and confirm lifecycle classification (daily or annual). Never repair a run directory in place or advance `latest.json` to an incompletely verified upload.
