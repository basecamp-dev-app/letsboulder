import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type MutationStatus = 'pending' | 'syncing' | 'failed'

export interface MutationOutboxRecord<Payload = unknown> {
  mutationId: string
  userId: string
  operationType: string
  payload: Payload
  createdAt: string
  retryCount: number
  status: MutationStatus
  lastError?: string
}

interface MutationOutboxSchema extends DBSchema {
  mutation_outbox: {
    key: string
    value: MutationOutboxRecord
    indexes: {
      userId: string
      status: MutationStatus
      createdAt: string
    }
  }
}

const DATABASE_NAME = 'letsboulder-offline-mutations'
const DATABASE_VERSION = 1
const STORE_NAME = 'mutation_outbox'

let databasePromise: Promise<IDBPDatabase<MutationOutboxSchema>> | null = null

function openMutationDatabase(): Promise<IDBPDatabase<MutationOutboxSchema>> {
  if (!databasePromise) {
    databasePromise = openDB<MutationOutboxSchema>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'mutationId' })
        store.createIndex('userId', 'userId')
        store.createIndex('status', 'status')
        store.createIndex('createdAt', 'createdAt')
      },
      blocking() {
        databasePromise = null
      },
      terminated() {
        databasePromise = null
      },
    })
  }
  return databasePromise
}

export async function queueMutation<Payload>(
  mutation: Omit<MutationOutboxRecord<Payload>, 'status' | 'retryCount'>,
): Promise<void> {
  const database = await openMutationDatabase()
  await database.put(STORE_NAME, {
    ...mutation,
    status: 'pending',
    retryCount: 0,
  })
}

export async function getPendingMutations(userId?: string): Promise<MutationOutboxRecord[]> {
  const database = await openMutationDatabase()
  const records = await database.getAll(STORE_NAME)
  return records
    .filter((record) => (!userId || record.userId === userId) && (record.status === 'pending' || record.status === 'failed'))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function markMutationSuccess(mutationId: string): Promise<void> {
  const database = await openMutationDatabase()
  await database.delete(STORE_NAME, mutationId)
}

export async function markMutationFailed(mutationId: string, error: unknown): Promise<void> {
  const database = await openMutationDatabase()
  const record = await database.get(STORE_NAME, mutationId)
  if (!record) return
  await database.put(STORE_NAME, {
    ...record,
    retryCount: record.retryCount + 1,
    status: 'failed',
    lastError: error instanceof Error ? error.message : 'Mutation replay failed',
  })
}

export async function markMutationSyncing(mutationId: string): Promise<void> {
  const database = await openMutationDatabase()
  const record = await database.get(STORE_NAME, mutationId)
  if (!record) return
  await database.put(STORE_NAME, { ...record, status: 'syncing' })
}

export async function resetSyncingMutations(): Promise<void> {
  const database = await openMutationDatabase()
  const records = await database.getAll(STORE_NAME)
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  for (const record of records) {
    if (record.status === 'syncing') transaction.store.put({ ...record, status: 'pending' })
  }
  await transaction.done
}

export async function clearMutationOutboxForTests(): Promise<void> {
  databasePromise = null
  await deleteDB(DATABASE_NAME)
}
