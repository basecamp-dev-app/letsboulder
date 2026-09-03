import { OfflinePackManager } from '@/features/offline/lib/offline-pack-manager'
import type { OfflinePackSnapshot, OfflineStorageStatus } from '@/features/offline/lib/offline-pack-types'

export class OfflinePackStore {
  private snapshot: OfflinePackSnapshot = { loading: false, packs: [], error: null }
  private readonly serverSnapshot: OfflinePackSnapshot = { loading: false, packs: [], error: null }
  private readonly listeners = new Set<() => void>()

  constructor(private readonly manager: OfflinePackManager) {}

  getSnapshot = (): OfflinePackSnapshot => this.snapshot
  getServerSnapshot = (): OfflinePackSnapshot => this.serverSnapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async refresh(): Promise<void> {
    await this.run(async () => {
      const packs = await this.manager.list()
      this.setSnapshot({ loading: false, packs, error: null })
    })
  }

  async install(manifestUrl: string): Promise<OfflineStorageStatus> {
    return this.run(async () => {
      const result = await this.manager.install(manifestUrl)
      this.setSnapshot({ loading: false, packs: await this.manager.list(), error: null })
      return result.storageStatus
    })
  }

  async update(packId: string): Promise<void> {
    await this.run(async () => {
      await this.manager.update(packId)
      this.setSnapshot({ loading: false, packs: await this.manager.list(), error: null })
    })
  }

  async repair(packId: string): Promise<void> {
    await this.run(async () => {
      await this.manager.repair(packId)
      this.setSnapshot({ loading: false, packs: await this.manager.list(), error: null })
    })
  }

  async remove(packId: string): Promise<void> {
    await this.run(async () => {
      await this.manager.remove(packId)
      this.setSnapshot({ loading: false, packs: await this.manager.list(), error: null })
    })
  }

  async discardFailed(packId: string): Promise<void> {
    await this.run(async () => {
      await this.manager.discardFailed(packId)
      this.setSnapshot({ loading: false, packs: await this.manager.list(), error: null })
    })
  }

  async resume(): Promise<void> {
    await this.run(async () => {
      await this.manager.resume()
      if (typeof navigator !== 'undefined' && navigator.onLine) await this.manager.migrateLegacyPacks()
      this.setSnapshot({ loading: false, packs: await this.manager.list(), error: null })
    })
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.setSnapshot({ ...this.snapshot, loading: true, error: null })
    try {
      return await operation()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Offline pack operation failed'
      let packs = this.snapshot.packs
      try {
        packs = await this.manager.list()
      } catch {
        // Preserve the last readable snapshot when browser storage is also unavailable.
      }
      this.setSnapshot({ loading: false, packs, error: message })
      throw error
    }
  }

  private setSnapshot(snapshot: OfflinePackSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

export const offlinePackStore = new OfflinePackStore(new OfflinePackManager())
