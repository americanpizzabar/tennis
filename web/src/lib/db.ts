import { openDB, IDBPDatabase } from 'idb'
import type { MatchReport } from '../types/match'
import type { LessonReport } from '../types/lesson'
import type { PlayerScouting } from '../scouting/types'

const DB_NAME = 'tennis-ai-coach'
const DB_VERSION = 3
const STORE_REPORTS = 'match_reports'
const STORE_SETTINGS = 'settings'
const STORE_LESSONS = 'lesson_reports'
const STORE_SCOUTING = 'scouting'

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
        if (oldVersion < 3) {
          const sc = db.createObjectStore(STORE_SCOUTING, { keyPath: 'id' })
          sc.createIndex('updatedAt', 'updatedAt')
          sc.createIndex('isMe', 'isMe')
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

// ── スカウティング（自分／対戦相手プロファイル） ──────
export async function saveScouting(p: PlayerScouting): Promise<void> {
  const db = await getDb()
  await db.put(STORE_SCOUTING, p)
}

export async function getAllScoutings(): Promise<PlayerScouting[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex(STORE_SCOUTING, 'updatedAt')
  return (all as PlayerScouting[]).reverse()
}

export async function getScouting(id: string): Promise<PlayerScouting | undefined> {
  const db = await getDb()
  return (await db.get(STORE_SCOUTING, id)) as PlayerScouting | undefined
}

export async function getMyScouting(): Promise<PlayerScouting | undefined> {
  const db = await getDb()
  const all = await db.getAll(STORE_SCOUTING) as PlayerScouting[]
  return all.find(p => p.isMe)
}

export async function deleteScouting(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_SCOUTING, id)
}
