/** The only user-installable offline product. Child climb manifests are internal dependencies. */
export type OfflinePackKind = 'crag'
export type OfflinePackStatus = 'not-saved' | 'downloading' | 'verifying' | 'verified' | 'at-risk' | 'needs-repair' | 'update-failed' | 'unsupported'
  | 'installing' | 'ready' | 'degraded' | 'error'

export interface OfflinePackAsset {
  url: string
  contentKey: string
  byteCount: number
  mediaType: string | null
  digest: `sha256:${string}`
  requirement: 'required' | 'optional'
  owningImageId: string | null
  owningClimbIds: string[]
  /** Pack v1 compatibility input; never used as Pack v2 integrity evidence. */
  estimatedBytes?: number | null
}

export interface OfflinePackManifest {
  packId: string
  kind: OfflinePackKind
  entityId: string
  displayName: string
  version: string
  manifestUrl: string
  exactTotalBytes: number
  assets: OfflinePackAsset[]
  dependentManifestUrls: string[]
  payload: unknown
}

export interface OfflinePackRecord {
  packId: string
  kind: OfflinePackKind
  entityId: string
  displayName: string
  manifestUrl: string
  activeVersion: string | null
  status: OfflinePackStatus
  installedAt: string | null
  /** Older records predate this field and are treated as installedAt. */
  lastSuccessfulUpdateAt?: string | null
  updatedAt: string
  error: string | null
  storageRisk?: boolean
  legacySource?: boolean
}

export interface OfflinePackVersionRecord {
  id: string
  packId: string
  version: string
  manifest: OfflinePackManifest
  state: 'staging' | 'verified' | 'active' | 'retained' | 'rolled-back'
  createdAt: string
  verifiedAt?: string | null
  activatedAt?: string | null
  openedAt?: string | null
  source?: 'v2' | 'legacy'
}

export interface OfflineAssetOwnershipRecord {
  id: string
  versionId: string
  packId: string
  version: string
  url: string
  contentKey: string
  byteCount: number
  mediaType: string | null
  digest: `sha256:${string}`
  requirement: 'required' | 'optional'
  owningImageId: string | null
  owningClimbIds: string[]
  state: 'pending' | 'verified' | 'cached'
  downloadedBytes: number
  verifiedDigest: `sha256:${string}` | null
}

export interface OfflineDownloadJobRecord {
  id: string
  packId: string
  version: string
  versionId: string
  state: 'queued' | 'downloading' | 'verifying' | 'verified' | 'activated' | 'opened' | 'failed' | 'cancelled' | 'rolled-back'
  completedAssets: number
  totalAssets: number
  downloadedBytes: number
  error: string | null
  updatedAt: string
  /** Older records omit this and are treated as resumable. */
  failureKind?: 'resumable' | 'permanent'
}

export interface ActiveOfflinePack {
  pack: OfflinePackRecord
  version: OfflinePackVersionRecord
}

export interface OfflineStorageStatus {
  persisted: boolean | null
  persistenceRequested: boolean
  quota: number | null
  usage: number | null
  available: number | null
}

export interface OfflinePackInstallResult {
  active: ActiveOfflinePack
  storageStatus: OfflineStorageStatus
}

export interface OfflinePackSnapshot {
  loading: boolean
  packs: readonly OfflinePackRecord[]
  error: string | null
}

export interface OfflinePackValidation {
  active: ActiveOfflinePack
  missingUrls: string[]
  corruptUrls: string[]
}

export type OfflineMigrationState = 'not-started' | 'staging' | 'verified' | 'activated' | 'opened' | 'failed' | 'rolled-back'

export interface OfflineMigrationRecord {
  id: string
  packId: string
  legacyVersionId: string
  targetVersionId: string | null
  state: OfflineMigrationState
  error: string | null
  updatedAt: string
}
