import { openDB, IDBPDatabase } from 'idb'
import type { MatchReport } from '../types/match'
import type { LessonReport } from '../types/lesson'

const DB_NAME = 'tennis-ai-coach'
const DB_VERSION = 2
const STORE_REPORTS = 'match_reports'
const STORE_SETTINGS = 'settings'
const STORE_LESSONS = 'lesson_reports'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const s = db.createObjectStore(STORE_REPORTS, { keyPath: 'matchId' })
          s.createIndex('createdAt', 'createdAt')
          db.createObjectStore(STORE_SETTINGS)
        }
        if (oldVersion < 2) {
          const l = db.createObjectStore(STORE_LESSONS, { keyPath: 'lessonId' })
          l.createIndex('createdAt', 'createdAt')
          l.createIndex('shot', 'shot')
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

// ── レッスン記録 ─────────────────────────────────────────
export async function saveLessonReport(report: LessonReport): Promise<void> {
  const db = await getDb()
  await db.put(STORE_LESSONS, report)
}

export async function getAllLessonReports(): Promise<LessonReport[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex(STORE_LESSONS, 'createdAt')
  return all.reverse() as LessonReport[]
}

export async function getLessonReport(lessonId: string): Promise<LessonReport | undefined> {
  const db = await getDb()
  return (await db.get(STORE_LESSONS, lessonId)) as LessonReport | undefined
}

export async function deleteLessonReport(lessonId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_LESSONS, lessonId)
}
