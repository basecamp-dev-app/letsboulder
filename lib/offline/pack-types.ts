import type { ClimbOfflinePackManifest, CragOfflinePackManifest } from '@/features/climb/lib/queries'

export const OFFLINE_PACK_BUDGET_BYTES = 250 * 1024 * 1024

export interface OfflinePackStatus {
  pack: ClimbOfflinePackManifest | null
  usageBytes: number
  budgetBytes: number
}

export interface CragOfflineStatus {
  pack: CragOfflinePackManifest | null
  usageBytes: number
  budgetBytes: number
}

export interface CragOfflinePreview {
  manifest: CragOfflinePackManifest
  existingPack: CragOfflinePackManifest | null
  changedClimbs: number
  deltaBytes: number
  totalBytes: number
  usageBytes: number
  budgetBytes: number
  isUpToDate: boolean
  warning?: string | null
}

interface SaveCragOfflineResult {
  preview: CragOfflinePreview
  unsubscribe: () => void
  completed: Promise<void>
  warning?: string
}

export type { SaveCragOfflineResult }
