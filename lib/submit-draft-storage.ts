const STORAGE_PROBE_KEY = 'submit-draft-storage:probe'

let cachedStorage: Storage | null | undefined

function canUseStorage(storage: Storage): boolean {
  try {
    storage.setItem(STORAGE_PROBE_KEY, '1')
    storage.removeItem(STORAGE_PROBE_KEY)
    return true
  } catch {
    return false
  }
}

function getClientStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  if (cachedStorage !== undefined) return cachedStorage

  if (canUseStorage(window.localStorage)) {
    cachedStorage = window.localStorage
    return cachedStorage
  }

  if (canUseStorage(window.sessionStorage)) {
    cachedStorage = window.sessionStorage
    return cachedStorage
  }

  cachedStorage = null
  return cachedStorage
}

export function draftStorageGetItem(key: string): string | null {
  const storage = getClientStorage()
  if (!storage) return null

  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function draftStorageSetItem(key: string, value: string): boolean {
  const storage = getClientStorage()
  if (!storage) return false

  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function draftStorageRemoveItem(key: string): void {
  const storage = getClientStorage()
  if (!storage) return

  try {
    storage.removeItem(key)
  } catch {
    // Ignore storage removal errors
  }
}
