import type {
  BallKey, DangerZoneKey, PlayerKey, PlayerTrack, Scenario,
  ScenarioCategory, Side, TargetGateKey, VisionConeRole,
} from './types'

/**
 * ラリービルダー：
 * 「ボールは打点（プレイヤーのラケット位置）かバウンド地点でしか方向を変えない」
 * という物理的制約を保証するシナリオ生成器。
 *
 * これにより「人がいないのにボールが曲がる」バグを構造的に防ぐ。
 * 高レベルなラリー定義（誰がどこへ打つか）から、整合性の取れた
 * ボール軌道・プレイヤー位置・デンジャーゾーン・ターゲットゲートを自動生成する。
 */

type Role = 'YOU' | 'PARTNER' | 'OPP1' | 'OPP2'

/** 1 つの打撃イベント。 */
export interface Contact {
  /** 打点の時刻（ms）。 */
  tMs: number
  /** 誰が打つか。 */
  hitter: Role
  /** 打点位置（x, y, z）。y は打点高さ（0.7〜1.3 程度）。 */
  pos: [number, number, number]
  /** この打球が着地（バウンド）する位置（x, 0, z）。ボレーで次に取られる場合は省略。 */
  bounce?: [number, number, number]
  /** バウンドの時刻（ms）。bounce があるとき必須。 */
  bounceTMs?: number
  /** 軌道の山の高さ（省略時 0.6m 程度）。 */
  apex?: number
  /** この打点に光るターゲットゲートを出すか。 */
  gateLabel?: string
  showGate?: boolean
  /** この打点で出すナレーション。 */
  beat?: string
  beatEmphasized?: boolean
  /** この打点の後に表示するデンジャーゾーン。 */
  danger?: { center: [number, number]; radius: number }
}

export interface PlayerSpec {
  role: Role
  label: string
  side: Side
  color: string
  /** 待機（ホーム）位置（x, z）。 */
  home: [number, number]
}

/** 振付け用の追加移動ウェイポイント（ポーチ・スイッチ等）。 */
export interface MoveWaypoint {
  role: Role
  tMs: number
  pos: [number, number]
  facing?: number
}

export interface RallyDef {
  id: string
  category: ScenarioCategory
  title: string
  subtitle: string
  goal: string
  proReference?: string
  players: PlayerSpec[]
  contacts: Contact[]
  /** 最後のバウンド後にアニメを終える時刻（ms）。 */
  endTMs: number
  visionConesOf?: VisionConeRole
  pressureRange?: { startMs: number; endMs: number }
  rightHandedAssumption?: boolean
  /** プレイヤーの追加移動（非打者のカバー動作など）。 */
  extraMoves?: MoveWaypoint[]
  /** 開始時のナレーション。 */
  introBeat?: string
}

/** ラリー定義から整合性の取れた Scenario を生成。 */
export function buildRally(def: RallyDef): Scenario {
  const sortedContacts = [...def.contacts].sort((a, b) => a.tMs - b.tMs)

  // ── ボール軌道：打点 → バウンド → 次の打点 → … ──
  // 各打点とバウンドだけがキーフレーム。空中での方向転換は発生しない。
  const ballPath: BallKey[] = []
  const pushBall = (tMs: number, pos: [number, number, number]) => {
    // 同一時刻の重複を避ける
    if (ballPath.length > 0 && Math.abs(ballPath[ballPath.length - 1].tMs - tMs) < 1) return
    ballPath.push({ tMs, pos })
  }
  for (let i = 0; i < sortedContacts.length; i++) {
    const c = sortedContacts[i]
    const next = sortedContacts[i + 1]
    pushBall(c.tMs, c.pos)
    const apexH = c.apex ?? 0.6
    if (c.bounce && c.bounceTMs !== undefined) {
      // バウンドあり：打点 → 山 → バウンド
      const apexT = (c.tMs + c.bounceTMs) / 2
      const midX = (c.pos[0] + c.bounce[0]) / 2
      const midZ = (c.pos[2] + c.bounce[2]) / 2
      const baseY = (c.pos[1] + c.bounce[1]) / 2
      pushBall(apexT, [midX, baseY + apexH, midZ])
      pushBall(c.bounceTMs, c.bounce)
    } else if (next) {
      // バウンドなし（ボレーで取られる）：打点 → 山 → 次打点へ直接
      const apexT = (c.tMs + next.tMs) / 2
      const midX = (c.pos[0] + next.pos[0]) / 2
      const midZ = (c.pos[2] + next.pos[2]) / 2
      const baseY = (c.pos[1] + next.pos[1]) / 2
      pushBall(apexT, [midX, baseY + apexH * 0.5, midZ])
    }
  }

  // ── プレイヤー軌道 ──
  // 各プレイヤーは「自分の打点」に必ず到達する。打点間はホームへ戻る動きを補間。
  const players: PlayerTrack[] = def.players.map(spec => {
    const myContacts = sortedContacts.filter(c => c.hitter === spec.role)
    const myMoves = (def.extraMoves ?? []).filter(m => m.role === spec.role)
    const keys: PlayerKey[] = []

    // 開始位置
    keys.push({ tMs: 0, pos: spec.home })

    // 打点ごとに「到達」キーフレーム＋「リカバリー」キーフレーム
    for (const c of myContacts) {
      const contactXZ: [number, number] = [c.pos[0], c.pos[2]]
      // 打点に向かう（少し手前から動き出す）
      keys.push({ tMs: Math.max(0, c.tMs - 200), pos: contactXZ, facing: facingTowardOpponent(spec.side) })
      keys.push({ tMs: c.tMs, pos: contactXZ })
      // 打った後はホーム（または二等分線）へ戻り始める
      const recoverT = c.tMs + 600
      const recoverPos = recoveryPosition(spec.home, contactXZ)
      keys.push({ tMs: recoverT, pos: recoverPos })
    }

    // 追加ウェイポイント
    for (const m of myMoves) {
      keys.push({ tMs: m.tMs, pos: m.pos, facing: m.facing })
    }

    // 最終位置
    const last = keys[keys.length - 1]
    keys.push({ tMs: def.endTMs, pos: last.pos })

    // 時刻でソート＆重複除去
    keys.sort((a, b) => a.tMs - b.tMs)
    const dedup: PlayerKey[] = []
    for (const k of keys) {
      if (dedup.length > 0 && Math.abs(dedup[dedup.length - 1].tMs - k.tMs) < 1) {
        dedup[dedup.length - 1] = k   // 後勝ち
      } else {
        dedup.push(k)
      }
    }

    return {
      id: spec.role.toLowerCase(),
      label: spec.label,
      side: spec.side,
      color: spec.color,
      role: spec.role,
      keyframes: dedup,
    }
  })

  // ── デンジャーゾーン ──
  const dangerZones: DangerZoneKey[] = [
    { tMs: 0, center: [0, 0], radius: 0, visible: false },
  ]
  for (const c of sortedContacts) {
    if (c.danger) {
      dangerZones.push({
        tMs: c.bounceTMs ?? c.tMs, center: c.danger.center, radius: c.danger.radius, visible: true,
      })
    }
  }
  // 終了時にフェードアウト
  if (dangerZones.length > 1) {
    const last = dangerZones[dangerZones.length - 1]
    dangerZones.push({ tMs: def.endTMs, center: last.center, radius: 0.3, visible: false })
  }

  // ── ターゲットゲート ──
  const targetGates: TargetGateKey[] = []
  for (const c of sortedContacts) {
    if (c.showGate && c.gateLabel && c.bounce) {
      const gatePos: [number, number, number] = [c.bounce[0], 1.0, c.bounce[2]]
      const norm: [number, number, number] = [0, 0, c.bounce[2] > 0 ? -1 : 1]
      targetGates.push({
        tMs: c.tMs, pos: gatePos, normal: norm, radius: 0.9, visible: true, label: c.gateLabel,
      })
      targetGates.push({
        tMs: (c.bounceTMs ?? c.tMs) + 600, pos: gatePos, normal: norm, radius: 0.4, visible: false,
      })
    }
  }

  // ── ナレーション ──
  const beats = []
  if (def.introBeat) beats.push({ tMs: 0, text: def.introBeat })
  for (const c of sortedContacts) {
    if (c.beat) beats.push({ tMs: c.tMs, text: c.beat, emphasized: c.beatEmphasized })
  }
  beats.sort((a, b) => a.tMs - b.tMs)

  return {
    id: def.id,
    category: def.category,
    title: def.title,
    subtitle: def.subtitle,
    goal: def.goal,
    proReference: def.proReference,
    durationMs: def.endTMs,
    ballPath,
    players,
    dangerZones,
    beats,
    targetGates,
    visionConesOf: def.visionConesOf ?? 'ALL',
    pressureRange: def.pressureRange,
    rightHandedAssumption: def.rightHandedAssumption,
  }
}

/** 自陣（z<0）プレイヤーは +z（相手）を、敵陣は -z を向く。 */
function facingTowardOpponent(side: Side): number {
  return side === 'NEAR' ? 0 : Math.PI
}

/** 打点からホームへ 60% 戻った位置（リカバリー）。 */
function recoveryPosition(
  home: [number, number], contact: [number, number],
): [number, number] {
  return [
    contact[0] + (home[0] - contact[0]) * 0.6,
    contact[1] + (home[1] - contact[1]) * 0.6,
  ]
}
