import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { OFFLINE_DB_NAME, OFFLINE_DB_VERSION } from '@/lib/offline/constants'
import type { OfflineCragMeta, OfflineCragRecord, OfflineImageRecord } from '@/lib/offline/types'

interface OfflineDbSchema extends DBSchema {
  cragMeta: {
    key: string
    value: OfflineCragMeta
  }
  crags: {
    key: string
    value: OfflineCragRecord
  }
  images: {
    key: string
    value: OfflineImageRecord
    indexes: { 'by-crag': string }
  }
}

let dbPromise: Promise<IDBPDatabase<OfflineDbSchema>> | null = null

export function getOfflineDb() {
  if (typeof window === 'undefined') {
    throw new Error('Offline DB is only available in the browser')
  }

  if (!dbPromise) {
    dbPromise = openDB<OfflineDbSchema>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cragMeta')) {
          db.createObjectStore('cragMeta')
        }

        if (!db.objectStoreNames.contains('crags')) {
          db.createObjectStore('crags')
        }

        if (!db.objectStoreNames.contains('images')) {
          const store = db.createObjectStore('images')
          store.createIndex('by-crag', 'cragId')
        }
      },
    })
  }

  return dbPromise
}
