import { openDB, IDBPDatabase } from 'idb'
import type { MatchReport } from '../types/match'

const DB_NAME = 'tennis-ai-coach'
const DB_VERSION = 1
const STORE_REPORTS = 'match_reports'
const STORE_SETTINGS = 'settings'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_REPORTS)) {
          const s = db.createObjectStore(STORE_REPORTS, { keyPath: 'matchId' })
          s.createIndex('createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS)
        }
      },
    })
  }
  return dbPromise
}

export async function saveMatchReport(report: MatchReport): Promise<void> {
  const db = await getDb()
  await db.put(STORE_REPORTS, report)
}

export async function getAllMatchReports(): Promise<MatchReport[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex(STORE_REPORTS, 'createdAt')
  return all.reverse() as MatchReport[]
}

export async function getMatchReport(matchId: string): Promise<MatchReport | undefined> {
  const db = await getDb()
  return (await db.get(STORE_REPORTS, matchId)) as MatchReport | undefined
}

export async function deleteMatchReport(matchId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_REPORTS, matchId)
}

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDb()
  return (await db.get(STORE_SETTINGS, key)) as T | undefined
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb()
  await db.put(STORE_SETTINGS, value, key)
}
