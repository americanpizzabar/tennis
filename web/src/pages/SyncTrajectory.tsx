import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSyncSession, saveSyncSession } from '../lib/db'
import type {
  BallTag, SyncCalibration, SyncClip, SyncMarker, SyncSessionRecord,
} from '../types/sync'
import type { Point2D } from '../lib/homography'
import {
  DOUBLES_CORNERS, SINGLES_CORNERS, buildVideoToCourt,
} from '../lib/homography'
import {
  recoverCameraFromCorners, triangulateBall, projectToGround, type CameraParams,
} from '../lib/triangulation'
import { TacticalBoard3D } from '../components/TacticalBoard3D'
import type { BallKey, Scenario } from '../tactics/types'
import { detectBallInFrame } from '../lib/ballDetector'
import { detectCourtFromVideo } from '../lib/courtDetector'
import { computeShotMetrics, SPIN_LABEL, type ShotMetric } from '../lib/ballMechanics'
import { buildCausalReport, type CausalReport } from '../lib/causalAnalysis'
import { detectVideoFrame, warmupPoseModel } from '../lib/poseDetector'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Phase 4：2 視点ホモグラフィ → 三角測量で 3D 弾道を生成。
 *
 * フロー：
 *  1) 後方／サイド の動画ごとに 4 隅をタップ（コートキャリブレーション）
 *  2) 各マーカー時刻で、両動画上のボール位置をタップ
 *  3) 2 視点の光線から (X, Y, Z) を三角測量
 *  4) TacticalBoard3D で 3D 再生
 */

type Phase = 'CALIBRATE_BACK' | 'CALIBRATE_SIDE' | 'TAG' | 'PREVIEW'

const CORNER_LABELS = [
  '左下（自陣ベースライン左角）',
  '左上（敵陣ベースライン左角）',
  '右上（敵陣ベースライン右角）',
  '右下（自陣ベースライン右角）',
]

export function SyncTrajectoryPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [rec, setRec] = useState<SyncSessionRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<Phase>('CALIBRATE_BACK')
  const [courtType, setCourtType] = useState<'SINGLES' | 'DOUBLES'>('DOUBLES')
  const [error, setError] = useState<string | null>(null)

  // ── キャリブレーション中の入力 ──
  const [backCorners, setBackCorners] = useState<Point2D[]>([])
  const [sideCorners, setSideCorners] = useState<Point2D[]>([])

  // ── タグ付け中の入力 ──
  const [tagIdx, setTagIdx] = useState(0)
  const [tapBack, setTapBack] = useState<Point2D | null>(null)
  const [tapSide, setTapSide] = useState<Point2D | null>(null)
  const [ballTags, setBallTags] = useState<BallTag[]>([])
  const [autoBusy, setAutoBusy] = useState(false)
  /** 各 HIT/SERVE マーカーで検出した骨格（causal 分析用）。 */
  const [poseAtMarker, setPoseAtMarker] = useState<Record<string, NormalizedLandmark[] | null>>({})

  // ── プレビュー ──
  const [previewT, setPreviewT] = useState(0)
  const [previewPlaying, setPreviewPlaying] = useState(true)

  const backRef = useRef<HTMLVideoElement>(null)
  const sideRef = useRef<HTMLVideoElement>(null)
  const backUrlRef = useRef<string | null>(null)
  const sideUrlRef = useRef<string | null>(null)

  // ── 読込 ──
  useEffect(() => {
    if (!id) return
    getSyncSession(id).then(r => {
      setRec(r ?? null)
      if (r) {
        const cal = r.calibration
        if (cal) {
          if (cal.back) setBackCorners(cal.back)
          if (cal.side) setSideCorners(cal.side)
          setCourtType(cal.courtType)
        }
        if (r.ballTags) setBallTags(r.ballTags)
        // 既に両方キャリブレーション済みならタグ付けへ
        if (cal?.back?.length === 4 && cal?.side?.length === 4) setPhase('TAG')
        else if (cal?.back?.length === 4) setPhase('CALIBRATE_SIDE')
      }
      setLoading(false)
    })
  }, [id])

  // ── 動画 URL ──
  useEffect(() => {
    if (!rec) return
    if (rec.back && backRef.current) {
      const url = URL.createObjectURL(rec.back.blob)
      backUrlRef.current = url
      backRef.current.src = url
    }
    if (rec.side && sideRef.current) {
      const url = URL.createObjectURL(rec.side.blob)
      sideUrlRef.current = url
      sideRef.current.src = url
    }
    return () => {
      if (backUrlRef.current) URL.revokeObjectURL(backUrlRef.current)
      if (sideUrlRef.current) URL.revokeObjectURL(sideUrlRef.current)
    }
  }, [rec])

  // ── マーカー（タグ付け対象） ──
  const markers = useMemo<SyncMarker[]>(() => {
    if (!rec?.markers) return []
    // HIT / BOUNCE / SERVE のみ弾道に関係
    const kinds = new Set(['HIT', 'BOUNCE', 'SERVE'])
    return rec.markers
      .filter(m => kinds.has(m.kind))
      .slice().sort((a, b) => a.epoch - b.epoch)
  }, [rec?.markers])

  // 現在のマーカー時刻に両動画をシーク
  const seekToMarker = (m: SyncMarker) => {
    if (!rec) return
    if (rec.back && backRef.current) {
      const ct = Math.max(0, (m.epoch - rec.back.startEpoch) / 1000)
      backRef.current.currentTime = Math.min(ct, rec.back.durationSec)
      backRef.current.pause()
    }
    if (rec.side && sideRef.current) {
      const ct = Math.max(0, (m.epoch - rec.side.startEpoch) / 1000)
      sideRef.current.currentTime = Math.min(ct, rec.side.durationSec)
      sideRef.current.pause()
    }
    const existing = ballTags.find(t => t.markerId === m.id)
    setTapBack(existing?.tapBack ?? null)
    setTapSide(existing?.tapSide ?? null)
  }

  // タグ付けフェーズに入ったら最初のマーカーへ
  useEffect(() => {
    if (phase !== 'TAG' || markers.length === 0) return
    seekToMarker(markers[Math.min(tagIdx, markers.length - 1)])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tagIdx, markers])

  // ── カメラ姿勢（メモ化） ──
  const camBack = useMemo<CameraParams | null>(() =>
    backCorners.length === 4
      ? recoverCameraFromCorners(backCorners, courtType === 'SINGLES' ? SINGLES_CORNERS : DOUBLES_CORNERS)
      : null
  , [backCorners, courtType])

  const camSide = useMemo<CameraParams | null>(() =>
    sideCorners.length === 4
      ? recoverCameraFromCorners(sideCorners, courtType === 'SINGLES' ? SINGLES_CORNERS : DOUBLES_CORNERS)
      : null
  , [sideCorners, courtType])

  // 単視点フォールバック用のホモグラフィ
  const H_back = useMemo(() =>
    backCorners.length === 4 ? buildVideoToCourt(backCorners, courtType) : null
  , [backCorners, courtType])
  const H_side = useMemo(() =>
    sideCorners.length === 4 ? buildVideoToCourt(sideCorners, courtType) : null
  , [sideCorners, courtType])

  // ── キャリブレーション保存 ──
  const saveCalibration = async (cal: SyncCalibration) => {
    if (!rec) return
    const next: SyncSessionRecord = { ...rec, calibration: cal }
    setRec(next)
    await saveSyncSession(next)
  }

  // ── ボールタグ保存 ──
  const saveTags = async (tags: BallTag[]) => {
    if (!rec) return
    const next: SyncSessionRecord = { ...rec, ballTags: tags }
    setRec(next)
    setBallTags(tags)
    await saveSyncSession(next)
  }

  // ── キャリブレーションのクリック処理 ──
  const onCalibClick = (e: React.MouseEvent<HTMLDivElement>, which: 'BACK' | 'SIDE') => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (which === 'BACK') {
      const next = backCorners.length < 4 ? [...backCorners, [x, y] as Point2D] : [[x, y] as Point2D]
      setBackCorners(next)
      if (next.length === 4) saveCalibration({ back: next, side: sideCorners.length === 4 ? sideCorners : undefined, courtType })
    } else {
      const next = sideCorners.length < 4 ? [...sideCorners, [x, y] as Point2D] : [[x, y] as Point2D]
      setSideCorners(next)
      if (next.length === 4) saveCalibration({ back: backCorners.length === 4 ? backCorners : undefined, side: next, courtType })
    }
  }

  // ── タグ付けのクリック処理 ──
  const onTagClick = (e: React.MouseEvent<HTMLDivElement>, which: 'BACK' | 'SIDE') => {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    if (which === 'BACK') setTapBack([x, y])
    else setTapSide([x, y])
  }

  // ── 🤖 自動検出（ボール）：両カメラの現フレームをスキャン ──
  const autoDetect = async () => {
    if (autoBusy) return
    setAutoBusy(true)
    try {
      // ヒント：直前のタグから位置の連続性を利用
      const prevTag = ballTags
        .map(t => ({ t, m: rec?.markers?.find(x => x.id === t.markerId) }))
        .filter(x => x.m && x.m.epoch < (currentMarker?.epoch ?? 0))
        .sort((a, b) => (b.m!.epoch - a.m!.epoch))[0]?.t
      const back = backRef.current
      const side = sideRef.current
      if (back && back.readyState >= 2) {
        const r = detectBallInFrame(back, { hint: prevTag?.tapBack })
        if (r) setTapBack(r.pos)
      }
      if (side && side.readyState >= 2) {
        const r = detectBallInFrame(side, { hint: prevTag?.tapSide })
        if (r) setTapSide(r.pos)
      }
    } finally {
      setAutoBusy(false)
    }
  }

  // ── 全マーカー一括自動検出＋骨格抽出 ──
  const autoDetectAll = async () => {
    if (!rec || markers.length === 0 || autoBusy) return
    setAutoBusy(true)
    try {
      await warmupPoseModel().catch(() => { /* モデル無くても続行 */ })
      const newTags: BallTag[] = [...ballTags]
      const newPose: Record<string, NormalizedLandmark[] | null> = { ...poseAtMarker }
      for (const m of markers) {
        // 両動画を該当時刻にシーク
        if (rec.back && backRef.current) {
          backRef.current.currentTime = Math.max(0, Math.min((m.epoch - rec.back.startEpoch) / 1000, rec.back.durationSec))
        }
        if (rec.side && sideRef.current) {
          sideRef.current.currentTime = Math.max(0, Math.min((m.epoch - rec.side.startEpoch) / 1000, rec.side.durationSec))
        }
        await waitForSeek(backRef.current)
        await waitForSeek(sideRef.current)
        // ボール検出
        let tB: Point2D | null = null, tS: Point2D | null = null
        if (backRef.current) {
          const r = detectBallInFrame(backRef.current)
          if (r) tB = r.pos
        }
        if (sideRef.current) {
          const r = detectBallInFrame(sideRef.current)
          if (r) tS = r.pos
        }
        // 三角測量 or フォールバック
        let pos: [number, number, number] | null = null
        let gap: number | undefined
        if (tB && tS && camBack && camSide) {
          const tri = triangulateBall(camBack, tB, camSide, tS)
          pos = tri.pos; gap = tri.gap
        } else if (tB && H_back) {
          pos = projectToGround(H_back, tB[0], tB[1])
        } else if (tS && H_side) {
          pos = projectToGround(H_side, tS[0], tS[1])
        }
        if (pos) {
          const tag: BallTag = {
            markerId: m.id, pos, tapBack: tB ?? undefined, tapSide: tS ?? undefined, gap,
          }
          const k = newTags.findIndex(x => x.markerId === m.id)
          if (k >= 0) newTags[k] = tag; else newTags.push(tag)
        }
        // 骨格（サイドカメラ）— HIT/SERVE のみ
        if ((m.kind === 'HIT' || m.kind === 'SERVE') && sideRef.current) {
          try {
            const ts = Math.floor((m.epoch - (rec.side?.startEpoch ?? 0)))
            const safeTs = Math.max(1, ts)
            const frame = await detectVideoFrame(sideRef.current, safeTs)
            newPose[m.id] = frame.landmarks
          } catch { /* noop */ }
        }
      }
      await saveTags(newTags)
      setPoseAtMarker(newPose)
    } finally {
      setAutoBusy(false)
    }
  }

  // ── 単マーカーで骨格を再検出（causal を更新） ──
  const detectPoseHere = async () => {
    if (!currentMarker || !sideRef.current) return
    if (!(currentMarker.kind === 'HIT' || currentMarker.kind === 'SERVE')) return
    await warmupPoseModel().catch(() => {})
    try {
      const ts = Math.max(1, Math.floor((currentMarker.epoch - (rec?.side?.startEpoch ?? 0))))
      const frame = await detectVideoFrame(sideRef.current, ts)
      setPoseAtMarker(p => ({ ...p, [currentMarker.id]: frame.landmarks }))
    } catch { /* noop */ }
  }

  // ── 現マーカーの三角測量結果 ──
  const currentMarker = markers[Math.min(tagIdx, markers.length - 1)]
  const triangulated = useMemo(() => {
    if (!tapBack || !tapSide) {
      // 単視点フォールバック（ボールが地面にある近似）
      if (tapBack && H_back) return { pos: projectToGround(H_back, tapBack[0], tapBack[1]), gap: undefined }
      if (tapSide && H_side) return { pos: projectToGround(H_side, tapSide[0], tapSide[1]), gap: undefined }
      return null
    }
    if (!camBack || !camSide) return null
    return triangulateBall(camBack, tapBack, camSide, tapSide)
  }, [tapBack, tapSide, camBack, camSide, H_back, H_side])

  const commitTag = () => {
    if (!currentMarker || !triangulated) return
    const tag: BallTag = {
      markerId: currentMarker.id,
      pos: triangulated.pos,
      tapBack: tapBack ?? undefined,
      tapSide: tapSide ?? undefined,
      gap: triangulated.gap,
    }
    const next = [...ballTags.filter(t => t.markerId !== currentMarker.id), tag]
    saveTags(next)
    // 次の未タグマーカーへ
    const nextIdx = markers.findIndex((m, i) => i > tagIdx && !next.some(t => t.markerId === m.id))
    if (nextIdx >= 0) setTagIdx(nextIdx)
  }

  // ── プレビュー用 Scenario の生成 ──
  const previewScenario = useMemo<Scenario | null>(() => {
    if (ballTags.length < 2 || !rec) return null
    // タグを時刻順に
    const tagsByEpoch = ballTags
      .map(t => {
        const m = rec.markers?.find(x => x.id === t.markerId)
        return m ? { t, epoch: m.epoch } : null
      })
      .filter((x): x is { t: BallTag; epoch: number } => x !== null)
      .sort((a, b) => a.epoch - b.epoch)

    if (tagsByEpoch.length < 2) return null

    const startEpoch = tagsByEpoch[0].epoch
    const endEpoch = tagsByEpoch[tagsByEpoch.length - 1].epoch
    const ballPath: BallKey[] = tagsByEpoch.map(({ t, epoch }) => ({
      tMs: epoch - startEpoch,
      pos: t.pos,
    }))

    return {
      id: 'phase4_triangulated',
      category: 'SINGLES_PATTERN',
      title: '実弾道（2 視点三角測量）',
      subtitle: `${tagsByEpoch.length} 点のタグから ${(endEpoch - startEpoch) / 1000}s の実 3D 弾道`,
      goal: '2 台カメラから三角測量で復元したボールの実 3D 軌道です（高さ含む）。',
      durationMs: endEpoch - startEpoch,
      ballPath,
      players: [],
      dangerZones: [],
      beats: [{ tMs: 0, text: '2 視点から復元した実 3D 弾道' }],
      targetGates: [],
      visionConesOf: 'NONE',
    }
  }, [ballTags, rec])

  // プレビュー再生ループ
  useEffect(() => {
    if (phase !== 'PREVIEW' || !previewScenario || !previewPlaying) return
    let raf = 0
    let last: number | null = null
    const step = (now: number) => {
      if (last === null) last = now
      const dt = now - last
      last = now
      setPreviewT(t => {
        const nt = t + dt
        if (nt > previewScenario.durationMs + 1200) return 0
        return Math.min(previewScenario.durationMs, nt)
      })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [phase, previewScenario, previewPlaying])

  if (loading) return <Center>読み込み中…</Center>
  if (!rec) return <Center>セッションが見つかりません</Center>
  if (!rec.back || !rec.side) return <Center>2 視点ともそろっていないため三角測量できません</Center>

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold text-sm">{rec.title}</h1>
          <p className="text-xs text-gray-400">3D 弾道変換（2 視点三角測量）</p>
        </div>
        <PhaseBadge phase={phase} />
      </header>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm">⚠️ {error}</div>
      )}

      {/* コート種別（キャリブ前のみ） */}
      {(phase === 'CALIBRATE_BACK' || phase === 'CALIBRATE_SIDE') && (
        <div className="bg-court-card rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-2">コート種別</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setCourtType('SINGLES')}
              className={`py-2 rounded text-sm font-bold ${courtType === 'SINGLES' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
              シングルス
            </button>
            <button onClick={() => setCourtType('DOUBLES')}
              className={`py-2 rounded text-sm font-bold ${courtType === 'DOUBLES' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
              ダブルス
            </button>
          </div>
        </div>
      )}

      {phase === 'CALIBRATE_BACK' && (
        <CalibratePane
          label="後方カメラ（俯瞰）" videoRef={backRef}
          corners={backCorners} onClick={e => onCalibClick(e, 'BACK')}
          onReset={() => setBackCorners([])}
          onNext={() => setPhase(sideCorners.length === 4 ? 'TAG' : 'CALIBRATE_SIDE')}
          done={backCorners.length === 4}
          onAuto={() => {
            const v = backRef.current
            if (!v) return
            const det = detectCourtFromVideo(v)
            if (det && det.confidence >= 0.25) {
              setBackCorners(det.corners)
              saveCalibration({ back: det.corners, side: sideCorners.length === 4 ? sideCorners : undefined, courtType })
            } else {
              setError('コートの自動検出に失敗しました。白線がよく見えるフレームで再試行するか、手動でタップしてください。')
            }
          }}
        />
      )}

      {phase === 'CALIBRATE_SIDE' && (
        <CalibratePane
          label="サイドカメラ（フォーム）" videoRef={sideRef}
          corners={sideCorners} onClick={e => onCalibClick(e, 'SIDE')}
          onReset={() => setSideCorners([])}
          onNext={() => setPhase('TAG')}
          done={sideCorners.length === 4}
          onAuto={() => {
            const v = sideRef.current
            if (!v) return
            const det = detectCourtFromVideo(v)
            if (det && det.confidence >= 0.25) {
              setSideCorners(det.corners)
              saveCalibration({ back: backCorners.length === 4 ? backCorners : undefined, side: det.corners, courtType })
            } else {
              setError('コートの自動検出に失敗しました。白線がよく見えるフレームで再試行するか、手動でタップしてください。')
            }
          }}
        />
      )}

      {phase === 'TAG' && (
        <TagPane
          rec={rec} markers={markers}
          backRef={backRef} sideRef={sideRef}
          tapBack={tapBack} tapSide={tapSide}
          onTapBack={e => onTagClick(e, 'BACK')} onTapSide={e => onTagClick(e, 'SIDE')}
          tagIdx={tagIdx} setTagIdx={setTagIdx}
          ballTags={ballTags}
          triangulated={triangulated}
          onCommit={commitTag}
          onClearTaps={() => { setTapBack(null); setTapSide(null) }}
          onReCalibrate={() => setPhase('CALIBRATE_BACK')}
          onFinish={() => previewScenario && setPhase('PREVIEW')}
          onAutoDetect={autoDetect}
          onAutoDetectAll={autoDetectAll}
          onDetectPose={detectPoseHere}
          autoBusy={autoBusy}
          poseAtMarker={poseAtMarker}
        />
      )}

      {phase === 'PREVIEW' && previewScenario && (
        <div className="space-y-3">
          <TacticalBoard3D scenario={previewScenario} tMs={previewT} cameraMode="DRONE" />
          <div className="flex gap-2">
            <button onClick={() => setPreviewPlaying(p => !p)}
              className="flex-1 bg-court-accent text-white font-bold py-2 rounded-lg text-sm">
              {previewPlaying ? '⏸ 一時停止' : '▶ 再生'}
            </button>
            <button onClick={() => setPreviewT(0)}
              className="px-3 py-2 bg-court-surface text-white rounded-lg">⏮</button>
            <button onClick={() => setPhase('TAG')}
              className="px-3 py-2 bg-court-surface text-white rounded-lg">タグへ戻る</button>
          </div>
          <input type="range" min={0} max={previewScenario.durationMs}
            value={previewT}
            onChange={e => { setPreviewPlaying(false); setPreviewT(Number(e.target.value)) }}
            className="w-full accent-court-accent" />
          <div className="bg-court-card rounded-xl p-3 text-xs space-y-1">
            <div className="text-court-accent font-bold">✅ 2 視点から実 3D 弾道を復元</div>
            <div className="text-gray-300">
              {ballTags.length} 点のタグから {(previewScenario.durationMs / 1000).toFixed(1)} 秒の弾道。
              高さ Y も三角測量で復元しているため、ネット越え／ロブの軌跡が立体的に見えます。
            </div>
            <TagAccuracy ballTags={ballTags} />
          </div>

          {/* ── 球速・スピン・因果テキスト ── */}
          <MetricsAndCausal rec={rec} poseAtMarker={poseAtMarker} />
        </div>
      )}
    </div>
  )
}

// ── サブコンポーネント ──────────────────────────────────
function CalibratePane({ label, videoRef, corners, onClick, onReset, onNext, done, onAuto }: {
  label: string
  videoRef: React.RefObject<HTMLVideoElement>
  corners: Point2D[]
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
  onReset: () => void
  onNext: () => void
  done: boolean
  onAuto?: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-bold text-court-warning">📐 {label} の 4 隅（自動検出 → タップ修正可）</div>
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video cursor-crosshair"
        onClick={onClick}>
        <video ref={videoRef} playsInline muted controls
          className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
        <CornerOverlay corners={corners} />
        {corners.length < 4 && (
          <div className="absolute top-2 left-2 right-2 bg-yellow-900/70 rounded px-2 py-1 text-xs text-court-warning">
            ⚠️ 「{CORNER_LABELS[corners.length]}」をタップ（{corners.length + 1}/4）
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {onAuto && (
          <button onClick={onAuto}
            className="flex-1 bg-court-info text-white text-sm font-bold py-2 rounded-lg active:scale-95">
            🤖 自動検出
          </button>
        )}
        <button onClick={onReset}
          className="flex-1 bg-court-card text-court-danger text-sm font-bold py-2 rounded-lg">
          ↶ やり直し
        </button>
        <button onClick={onNext} disabled={!done}
          className="flex-1 bg-green-700 disabled:bg-gray-700 text-white text-sm font-bold py-2 rounded-lg active:scale-95">
          ✅ 次へ
        </button>
      </div>
      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
        💡 動画は再生できます。コートの 4 隅がよく見えるフレームで一時停止してからタップしてください。
        順番：①左下 → ②左上 → ③右上 → ④右下（自陣→敵陣）
      </div>
    </div>
  )
}

function TagPane({
  rec, markers, backRef, sideRef, tapBack, tapSide,
  onTapBack, onTapSide, tagIdx, setTagIdx, ballTags, triangulated,
  onCommit, onClearTaps, onReCalibrate, onFinish,
  onAutoDetect, onAutoDetectAll, onDetectPose, autoBusy, poseAtMarker,
}: {
  rec: SyncSessionRecord
  markers: SyncMarker[]
  backRef: React.RefObject<HTMLVideoElement>
  sideRef: React.RefObject<HTMLVideoElement>
  tapBack: Point2D | null
  tapSide: Point2D | null
  onTapBack: (e: React.MouseEvent<HTMLDivElement>) => void
  onTapSide: (e: React.MouseEvent<HTMLDivElement>) => void
  tagIdx: number
  setTagIdx: (i: number) => void
  ballTags: BallTag[]
  triangulated: { pos: [number, number, number]; gap?: number } | null
  onCommit: () => void
  onClearTaps: () => void
  onReCalibrate: () => void
  onFinish: () => void
  onAutoDetect: () => void
  onAutoDetectAll: () => void
  onDetectPose: () => void
  autoBusy: boolean
  poseAtMarker: Record<string, NormalizedLandmark[] | null>
}) {
  if (markers.length === 0) {
    return (
      <div className="bg-court-card rounded-xl p-4 text-sm text-gray-300 space-y-2">
        <div>マーカーがないため弾道タグ付けができません。</div>
        <div className="text-xs text-gray-400">
          まずは「ツインスライダー再生」画面で HIT / BOUNCE / SERVE のマーカーを打ってください。
        </div>
      </div>
    )
  }
  const m = markers[Math.min(tagIdx, markers.length - 1)]
  const tagged = ballTags.some(t => t.markerId === m.id)
  return (
    <div className="space-y-3">
      <div className="bg-court-card rounded-xl p-3 flex items-center justify-between gap-2">
        <button onClick={() => setTagIdx(Math.max(0, tagIdx - 1))}
          disabled={tagIdx === 0}
          className="text-sm text-court-info disabled:text-gray-600">◁ 前</button>
        <div className="text-center">
          <div className="text-xs text-gray-400">マーカー {tagIdx + 1} / {markers.length}</div>
          <div className="text-sm font-bold">
            {markerKindLabel(m.kind)}{m.note && <span className="text-gray-400 font-normal"> ・ {m.note}</span>}
          </div>
        </div>
        <button onClick={() => setTagIdx(Math.min(markers.length - 1, tagIdx + 1))}
          disabled={tagIdx >= markers.length - 1}
          className="text-sm text-court-info disabled:text-gray-600">次 ▷</button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <TapTile label="後方" videoRef={backRef} present={!!rec.back}
          tap={tapBack} onClick={onTapBack} />
        <TapTile label="サイド" videoRef={sideRef} present={!!rec.side}
          tap={tapSide} onClick={onTapSide} />
      </div>

      {triangulated && (
        <div className="bg-court-card rounded-xl p-3 text-xs">
          <div className="text-court-accent font-bold mb-1">
            {tapBack && tapSide ? '🎯 三角測量（2 視点）' : '⚠️ 単視点（地面投影）'}
          </div>
          <div className="font-mono text-gray-300">
            X = {triangulated.pos[0].toFixed(2)} m ・
            Y = {triangulated.pos[1].toFixed(2)} m ・
            Z = {triangulated.pos[2].toFixed(2)} m
          </div>
          {triangulated.gap !== undefined && (
            <div className="text-gray-500 mt-1">
              光線間ミス距離：{(triangulated.gap * 100).toFixed(0)} cm
              {triangulated.gap < 0.3 ? ' ✓ 良好' : triangulated.gap < 0.8 ? ' ⚠ やや劣化' : ' ⚠ キャリブレーション再確認'}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button onClick={onAutoDetect} disabled={autoBusy}
          className="bg-court-info disabled:bg-gray-700 text-white text-xs font-bold py-2 rounded-lg active:scale-95 flex items-center justify-center gap-1">
          🤖 <span>{autoBusy ? '検出中…' : '自動検出'}</span>
        </button>
        <button onClick={onClearTaps}
          className="bg-court-card text-court-danger text-xs font-bold py-2 rounded-lg">
          ✕ タップ消去
        </button>
        <button onClick={onCommit}
          disabled={!triangulated}
          className="bg-court-accent disabled:bg-gray-700 text-white text-xs font-bold py-2 rounded-lg active:scale-95">
          {tagged ? '✓ 上書き' : '💾 保存'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={onAutoDetectAll} disabled={autoBusy}
          className="bg-gradient-to-br from-indigo-800 to-blue-700 disabled:bg-gray-700 text-white text-xs font-bold py-2 rounded-lg active:scale-95">
          🤖 全マーカー一括自動検出
        </button>
        {(m.kind === 'HIT' || m.kind === 'SERVE') && (
          <button onClick={onDetectPose} disabled={autoBusy}
            className="bg-court-card text-court-info text-xs font-bold py-2 rounded-lg active:scale-95">
            🦴 骨格を検出{poseAtMarker[m.id] ? ' ✓' : ''}
          </button>
        )}
      </div>

      <div className="bg-court-card rounded-xl p-3 text-xs flex items-center justify-between">
        <div>
          <span className="text-gray-400">タグ済み：</span>
          <span className="font-bold text-court-accent">{ballTags.length}</span>
          <span className="text-gray-400"> / {markers.length}</span>
        </div>
        <button onClick={onReCalibrate} className="text-court-info">⚙️ 再キャリブレーション</button>
      </div>

      {ballTags.length >= 2 && (
        <button onClick={onFinish}
          className="w-full bg-court-info text-white font-bold py-3 rounded-xl active:scale-95">
          ▶ 3D 弾道を再生する
        </button>
      )}

      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
        💡 両方の動画でボールの位置をタップすると、2 視点の光線交点から実 3D 位置（高さも含む）を復元します。
        ボールが小さく見える瞬間は、片方だけタップして地面投影で代用も可能です。
      </div>
    </div>
  )
}

function TapTile({ label, videoRef, present, tap, onClick }: {
  label: string
  videoRef: React.RefObject<HTMLVideoElement>
  present: boolean
  tap: Point2D | null
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div className="relative bg-black rounded-lg overflow-hidden aspect-[3/4] cursor-crosshair"
      onClick={onClick}>
      <video ref={videoRef} playsInline muted controls
        className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
      <div className="absolute top-1 left-1 bg-black/60 rounded px-1.5 py-0.5 text-[10px] font-bold text-court-accent">
        {label}
      </div>
      {tap && (
        <div className="absolute pointer-events-none"
          style={{
            left: `${tap[0] * 100}%`, top: `${tap[1] * 100}%`,
            transform: 'translate(-50%, -50%)',
          }}>
          <div className="w-4 h-4 rounded-full bg-court-warning ring-2 ring-white animate-pulse" />
        </div>
      )}
      {!present && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
          映像なし
        </div>
      )}
    </div>
  )
}

function CornerOverlay({ corners }: { corners: Point2D[] }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 56" preserveAspectRatio="none">
        {corners.map((c, i) => (
          <g key={i}>
            <circle cx={c[0] * 100} cy={c[1] * 56} r={1.5}
              fill="#F9A825" stroke="white" strokeWidth={0.3} />
            <text x={c[0] * 100} y={c[1] * 56 - 2.5}
              fill="white" fontSize={2.5} fontWeight="bold" textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
        {corners.length === 4 && (
          <polygon points={corners.map(c => `${c[0] * 100},${c[1] * 56}`).join(' ')}
            fill="rgba(249,168,37,0.15)" stroke="#F9A825" strokeWidth={0.3} strokeDasharray="1.5,1" />
        )}
      </svg>
    </div>
  )
}

function PhaseBadge({ phase }: { phase: Phase }) {
  const map: Record<Phase, [string, string]> = {
    CALIBRATE_BACK: ['後方キャリブ', 'bg-yellow-800 text-yellow-200'],
    CALIBRATE_SIDE: ['サイドキャリブ', 'bg-yellow-800 text-yellow-200'],
    TAG: ['タグ付け', 'bg-blue-800 text-blue-200'],
    PREVIEW: ['3D プレビュー', 'bg-green-800 text-court-accent'],
  }
  const [label, cls] = map[phase]
  return <span className={`text-[10px] font-bold px-2 py-1 rounded ${cls}`}>{label}</span>
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-md mx-auto p-8 text-center text-gray-400">{children}</div>
}

function markerKindLabel(k: SyncMarker['kind']): string {
  switch (k) {
    case 'HIT': return '🎾 打点'
    case 'BOUNCE': return '📍 バウンド'
    case 'SERVE': return '⚡ サーブ'
    case 'ACE': return '🌟 エース'
    case 'MISS': return '❌ ミス'
    case 'NOTE': return '✏️ メモ'
  }
}

function TagAccuracy({ ballTags }: { ballTags: BallTag[] }) {
  const withGap = ballTags.filter(t => t.gap !== undefined)
  if (withGap.length === 0) return null
  const avgGap = withGap.reduce((s, t) => s + (t.gap ?? 0), 0) / withGap.length
  const label = avgGap < 0.3 ? '高精度 ✓' : avgGap < 0.8 ? '良好' : '要再キャリブ'
  return (
    <div className="text-gray-500 text-[10px] mt-1">
      平均光線ミス距離：{(avgGap * 100).toFixed(0)} cm — {label}
    </div>
  )
}

function waitForSeek(v: HTMLVideoElement | null): Promise<void> {
  if (!v) return Promise.resolve()
  return new Promise(resolve => {
    let done = false
    const cleanup = () => { v.removeEventListener('seeked', onSeeked); done = true; resolve() }
    const onSeeked = () => { if (!done) cleanup() }
    v.addEventListener('seeked', onSeeked)
    // 保険：300ms で打ち切り
    setTimeout(() => { if (!done) cleanup() }, 300)
  })
}

function MetricsAndCausal({ rec, poseAtMarker }: {
  rec: SyncSessionRecord;
  poseAtMarker: Record<string, NormalizedLandmark[] | null>;
}) {
  const metrics: ShotMetric[] = useMemo(() => computeShotMetrics(rec), [rec])
  const reports: CausalReport[] = useMemo(() => {
    const markers = rec.markers ?? []
    const out: CausalReport[] = []
    for (const m of metrics) {
      const marker = markers.find(x => x.id === m.markerId)
      if (!marker) continue
      const sorted = markers.slice().sort((a, b) => a.epoch - b.epoch)
      const idx = sorted.findIndex(x => x.id === marker.id)
      const next = sorted[idx + 1]
      out.push(buildCausalReport({
        marker, metric: m,
        sideLandmarks: poseAtMarker[marker.id] ?? null,
        nextMarker: next,
      }))
    }
    return out
  }, [rec, metrics, poseAtMarker])

  if (metrics.length === 0) {
    return (
      <div className="bg-court-card rounded-xl p-3 text-xs text-gray-400">
        球速・因果分析には HIT/SERVE と BOUNCE のマーカー＋タグが必要です。
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 集計 */}
      <div className="bg-court-card rounded-xl p-3">
        <div className="text-xs text-gray-400 mb-2">📊 ショット集計</div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <Cell label="ショット数" value={`${metrics.length}`} />
          <Cell label="平均球速"
            value={avgKmh(metrics) != null ? `${avgKmh(metrics)!.toFixed(0)} km/h` : '—'} />
          <Cell label="最高球速"
            value={maxKmh(metrics) != null ? `${maxKmh(metrics)!.toFixed(0)} km/h` : '—'} />
        </div>
      </div>

      {/* 各ショットの因果カード */}
      <div className="space-y-2">
        {reports.map((r, i) => {
          const m = metrics[i]
          return (
            <div key={r.markerId} className="bg-court-card rounded-xl p-3 space-y-1.5">
              <div className="text-sm font-bold text-court-accent">{r.headline}</div>
              {/* 数値 */}
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {m.speedKmh != null && <Pill>球速 {m.speedKmh.toFixed(0)} km/h</Pill>}
                {m.apexM != null && <Pill>最高点 {m.apexM.toFixed(1)} m</Pill>}
                {m.netClearM != null && <Pill>ネット上 {m.netClearM.toFixed(2)} m</Pill>}
                {m.spin !== 'UNKNOWN' && <Pill>{SPIN_LABEL[m.spin]}</Pill>}
                {m.bouncePos && (
                  <Pill>着弾 ({m.bouncePos[0].toFixed(1)}, {m.bouncePos[1].toFixed(1)})</Pill>
                )}
              </div>
              {/* 因果タグ */}
              {(r.causeTags.length > 0 || r.resultTags.length > 0) && (
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {r.causeTags.map((t, j) => (
                    <span key={'c' + j} className="bg-blue-900/60 text-blue-200 px-1.5 py-0.5 rounded">
                      原因：{t}
                    </span>
                  ))}
                  {r.resultTags.map((t, j) => (
                    <span key={'r' + j} className="bg-emerald-900/60 text-emerald-200 px-1.5 py-0.5 rounded">
                      結果：{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function avgKmh(metrics: ShotMetric[]): number | null {
  const vals = metrics.map(m => m.speedKmh).filter((v): v is number => v != null)
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}
function maxKmh(metrics: ShotMetric[]): number | null {
  const vals = metrics.map(m => m.speedKmh).filter((v): v is number => v != null)
  if (vals.length === 0) return null
  return Math.max(...vals)
}
function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-black text-court-accent">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-court-surface text-gray-200 px-1.5 py-0.5 rounded">{children}</span>
  )
}

// 未使用警告を避ける（タップで使う SyncClip 型を保証）
export type _ = SyncClip
