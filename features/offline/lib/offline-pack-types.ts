export type OfflinePackKind = 'climb' | 'crag'
export type OfflinePackStatus = 'installing' | 'ready' | 'error'

export interface OfflinePackAsset {
  url: string
  estimatedBytes: number | null
  mediaType: string | null
}

export interface OfflinePackManifest {
  packId: string
  kind: OfflinePackKind
  entityId: string
  displayName: string
  version: string
  manifestUrl: string
  estimatedBytes: number
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
  updatedAt: string
  error: string | null
}

export interface OfflinePackVersionRecord {
  id: string
  packId: string
  version: string
  manifest: OfflinePackManifest
  state: 'staging' | 'active'
  createdAt: string
}

export interface OfflineAssetOwnershipRecord {
  id: string
  versionId: string
  packId: string
  version: string
  url: string
  estimatedBytes: number | null
  mediaType: string | null
  state: 'pending' | 'cached'
  downloadedBytes: number
}

export interface OfflineDownloadJobRecord {
  id: string
  packId: string
  version: string
  versionId: string
  state: 'queued' | 'downloading' | 'failed' | 'cancelled' | 'complete'
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
