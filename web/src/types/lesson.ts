import type { Shot } from '../data/idealForms'
import type {
  CheckpointResult, DrillSuggestion, SessionAnalysis,
} from '../lib/coachingFeedback'
import type { ImpactPoint } from '../lib/biomechanics'

/** 保存用：軽量化したフレーム（必要最低限のランドマークのみ）。 */
export interface SavedFrame {
  tSec: number
  /** key landmark の {x, y} を IDX -> [x, y] のオブジェクトで保存。 */
  lm: Record<number, [number, number]>
}

export interface LessonReport {
  lessonId: string
  shot: Shot
  side: 'RIGHT' | 'LEFT'
  durationSeconds: number
  swingCount: number
  overallScore: number
  coachingText: string
  checkpoints: CheckpointResult[]
  drills: DrillSuggestion[]
  impactPoints: ImpactPoint[]
  /** 軽量化したフレーム列（スロー再生用、最大 300 フレーム程度）。 */
  frames: SavedFrame[]
  createdAt: number
}

/** Web 用に軽量化：MediaPipe の 33 ランドマークから主要 13 個だけ残す。 */
export const KEY_LANDMARKS = [
  11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 0,
] as const
