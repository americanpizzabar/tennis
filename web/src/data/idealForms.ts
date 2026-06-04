/**
 * ショット別の理想フォーム数値レンジ。
 * テニス指導書・バイオメカニクス研究の代表値から作成。
 * 単位の絶対値は撮影位置依存だが、相対比較・トレンド分析には有効。
 */

export type Shot =
  | 'FOREHAND'
  | 'BACKHAND_ONE_HANDED'
  | 'BACKHAND_TWO_HANDED'
  | 'SERVE'
  | 'VOLLEY'
  | 'SLICE'
  | 'SMASH'

export const SHOT_LABEL: Record<Shot, string> = {
  FOREHAND: 'フォアハンド',
  BACKHAND_ONE_HANDED: '片手バックハンド',
  BACKHAND_TWO_HANDED: '両手バックハンド',
  SERVE: 'サーブ',
  VOLLEY: 'ボレー',
  SLICE: 'スライス',
  SMASH: 'スマッシュ',
}

export const SHOT_EMOJI: Record<Shot, string> = {
  FOREHAND: '🎾',
  BACKHAND_ONE_HANDED: '🤚',
  BACKHAND_TWO_HANDED: '🙌',
  SERVE: '🚀',
  VOLLEY: '⚡',
  SLICE: '🔪',
  SMASH: '🔨',
}

export interface IdealRange {
  /** 指標 ID。 */
  id: string
  /** 表示名。 */
  nameJa: string
  /** 理想最小値（°）。 */
  min: number
  /** 理想最大値（°）。 */
  max: number
  /** 過少時のアドバイス。 */
  lowAdvice: string
  /** 過大時のアドバイス。 */
  highAdvice: string
  /** 評価する位相（CONTACT / TAKEBACK / FOLLOW など）。 */
  phase: 'TAKEBACK' | 'CONTACT' | 'FOLLOW' | 'TIMING'
  /** 重要度。 */
  weight: number
}

export const IDEAL_FORMS: Record<Shot, IdealRange[]> = {
  FOREHAND: [
    {
      id: 'fh_elbow_contact', nameJa: 'インパクト時の肘の角度',
      min: 130, max: 170, phase: 'CONTACT', weight: 3,
      lowAdvice: '肘が曲がりすぎて打点が体に近すぎます。腕を伸ばして遠くで捉えましょう。',
      highAdvice: '肘が伸び切ってロックしています。少し緩めて余裕を持たせましょう。',
    },
    {
      id: 'fh_knee_contact', nameJa: 'インパクト時の膝の角度',
      min: 130, max: 165, phase: 'CONTACT', weight: 2,
      lowAdvice: '膝が深く沈みすぎ。爆発的な伸び上がりが起きにくくなります。',
      highAdvice: '膝が伸び切って棒立ち。地面反力を使えていません。',
    },
    {
      id: 'fh_twist_takeback', nameJa: 'テイクバック時の胸の捻り',
      min: 30, max: 70, phase: 'TAKEBACK', weight: 3,
      lowAdvice: '上半身の捻りが浅い。肩を深く入れてパワーを溜めましょう。',
      highAdvice: '捻りすぎでタイミングが崩れる恐れ。',
    },
    {
      id: 'fh_pelvis_lead', nameJa: '骨盤→肩の時間差（運動連鎖）',
      min: 0.03, max: 0.20, phase: 'TIMING', weight: 3,
      lowAdvice: '骨盤と肩がほぼ同時に回っており「手打ち」気味。下半身からの連鎖を意識。',
      highAdvice: '骨盤先行は良いが、肩の追従が遅れすぎています。',
    },
  ],
  BACKHAND_ONE_HANDED: [
    {
      id: 'bh1_elbow_contact', nameJa: 'インパクト時の肘の角度',
      min: 150, max: 180, phase: 'CONTACT', weight: 3,
      lowAdvice: '片手バックは特に肘を伸ばして打つ必要があります。手打ちにならないよう肘を伸ばす。',
      highAdvice: '伸び切りでロック気味。動きを止めない範囲で。',
    },
    {
      id: 'bh1_contact_forward', nameJa: '打点と前足の前後位置',
      min: 0.03, max: 0.15, phase: 'CONTACT', weight: 3,
      lowAdvice: '打点が前足より後ろです。片手バックは前足のさらに前で捉えましょう。',
      highAdvice: '打点が極端に前で、踏み込みが届いていません。',
    },
    {
      id: 'bh1_chest_block', nameJa: 'インパクト時の胸の開き',
      min: 0, max: 25, phase: 'CONTACT', weight: 3,
      lowAdvice: '計測不能。',
      highAdvice: '体が早く開きすぎ。左手（非利き手）を後方に残してブロックを意識。',
    },
    {
      id: 'bh1_knee_contact', nameJa: 'インパクト時の膝の角度',
      min: 120, max: 155, phase: 'CONTACT', weight: 2,
      lowAdvice: '膝が深すぎる。',
      highAdvice: '棒立ち。低い球も膝で潜り込んで持ち上げましょう。',
    },
    {
      id: 'bh1_takeback_lead', nameJa: 'テイクバック完了の早さ',
      min: 0.15, max: 0.6, phase: 'TIMING', weight: 2,
      lowAdvice: 'テイクバックがインパクト直前で、引き遅れています。',
      highAdvice: '早すぎる準備で動きが止まっている可能性。',
    },
  ],
  BACKHAND_TWO_HANDED: [
    {
      id: 'bh2_elbow_contact', nameJa: 'インパクト時の前腕角度（左肘）',
      min: 110, max: 150, phase: 'CONTACT', weight: 2,
      lowAdvice: '左腕の畳み込みが深すぎ。',
      highAdvice: '左腕が伸び切ってパワー伝達が弱くなります。',
    },
    {
      id: 'bh2_contact_forward', nameJa: '打点と前足の前後位置',
      min: 0.01, max: 0.12, phase: 'CONTACT', weight: 3,
      lowAdvice: '打点が後ろ。両手バックでも体の前で安定して捉えましょう。',
      highAdvice: '打点が極端に前。',
    },
    {
      id: 'bh2_twist_takeback', nameJa: 'テイクバック時の捻り',
      min: 25, max: 60, phase: 'TAKEBACK', weight: 2,
      lowAdvice: '捻り不足。両肩で深く回旋。',
      highAdvice: '過剰な捻り。',
    },
    {
      id: 'bh2_pelvis_lead', nameJa: '骨盤→肩の時間差（運動連鎖）',
      min: 0.02, max: 0.15, phase: 'TIMING', weight: 3,
      lowAdvice: '下半身からの連鎖が弱く手打ち気味。',
      highAdvice: '骨盤先行はよいが、肩の追従が遅れています。',
    },
  ],
  SERVE: [
    {
      id: 'sv_knee_trophy', nameJa: 'トロフィー時の膝の曲げ',
      min: 110, max: 135, phase: 'TAKEBACK', weight: 3,
      lowAdvice: '膝の溜めが浅い。深く曲げて地面反力を蓄えましょう。',
      highAdvice: '膝が伸び切り。',
    },
    {
      id: 'sv_elbow_contact', nameJa: 'インパクト時の肘伸び',
      min: 150, max: 180, phase: 'CONTACT', weight: 3,
      lowAdvice: '肘が曲がっており打点が低い。腕を伸ばし切って高い打点で。',
      highAdvice: '問題ありません。',
    },
    {
      id: 'sv_twist_takeback', nameJa: 'トロフィー時の捻り',
      min: 25, max: 60, phase: 'TAKEBACK', weight: 2,
      lowAdvice: '体の捻りが浅い。',
      highAdvice: '過剰な捻り。',
    },
  ],
  VOLLEY: [
    {
      id: 'vo_elbow_contact', nameJa: '肘の固定（コンパクト）',
      min: 120, max: 160, phase: 'CONTACT', weight: 3,
      lowAdvice: '肘が極端に畳まれてパンチが弱い。',
      highAdvice: '腕が伸びすぎて手打ち気味。',
    },
    {
      id: 'vo_knee_contact', nameJa: '膝の使い方',
      min: 110, max: 150, phase: 'CONTACT', weight: 2,
      lowAdvice: '膝が深すぎる。',
      highAdvice: '低い球を持ち上げるための膝の沈み込みが不足。',
    },
  ],
  SLICE: [
    {
      id: 'sl_elbow_contact', nameJa: '肘の伸び',
      min: 140, max: 175, phase: 'CONTACT', weight: 2,
      lowAdvice: '腕が縮こまっており、切る軌道が出にくい。',
      highAdvice: '伸び切りで余裕がなくなっている可能性。',
    },
    {
      id: 'sl_chest_block', nameJa: '胸の開きブロック',
      min: 0, max: 30, phase: 'CONTACT', weight: 2,
      lowAdvice: '計測不能。',
      highAdvice: '体が開いてスライスが浮きやすい。横向きをキープ。',
    },
  ],
  SMASH: [
    {
      id: 'sm_elbow_contact', nameJa: '肘の伸び（打点高さ）',
      min: 150, max: 180, phase: 'CONTACT', weight: 3,
      lowAdvice: '肘が曲がっており打点が低い。最高点で叩く意識を。',
      highAdvice: '問題ありません。',
    },
    {
      id: 'sm_knee_trophy', nameJa: '準備時の膝の使い',
      min: 110, max: 140, phase: 'TAKEBACK', weight: 2,
      lowAdvice: '膝の溜め不足。',
      highAdvice: '深すぎる溜めで反応が遅れる。',
    },
  ],
}
