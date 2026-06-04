import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { detectVideoFrame, PoseFrame, warmupPoseModel } from '../lib/poseDetector'
import { SkeletonOverlay } from '../components/SkeletonOverlay'
import { Shot, SHOT_EMOJI, SHOT_LABEL } from '../data/idealForms'
import { analyzeSession } from '../lib/coachingFeedback'
import { saveLessonReport } from '../lib/db'
import type { LessonReport, SavedFrame } from '../types/lesson'
import { KEY_LANDMARKS } from '../types/lesson'

type Phase = 'SELECT_SHOT' | 'CAMERA_SETUP' | 'RECORDING' | 'ANALYZING' | 'DONE'

export function LessonPage() {
  const nav = useNavigate()
  const [phase, setPhase] = useState<Phase>('SELECT_SHOT')
  const [shot, setShot] = useState<Shot>('FOREHAND')
  const [side, setSide] = useState<'RIGHT' | 'LEFT'>('RIGHT')
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [previewLm, setPreviewLm] = useState<PoseFrame | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const framesRef = useRef<PoseFrame[]>([])
  const rafRef = useRef<number | null>(null)
  const recordStartRef = useRef(0)
  const lastTsRef = useRef(0)

  // モデルウォームアップ
  useEffect(() => {
    if (phase !== 'CAMERA_SETUP' && phase !== 'RECORDING') return
    warmupPoseModel().then(() => setModelReady(true)).catch(e => {
      setError('AI モデルのロードに失敗しました：' + (e?.message ?? String(e)))
    })
  }, [phase])

  // カメラ起動
  useEffect(() => {
    if (phase !== 'CAMERA_SETUP' && phase !== 'RECORDING') return
    const start = async () => {
      try {
        if (!streamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
            audio: false,
          })
          streamRef.current = stream
          if (videoRef.current) {
            videoRef.current.srcObject = stream
            await videoRef.current.play()
          }
        }
      } catch (e: any) {
        setError('カメラへのアクセスに失敗しました：' + (e?.message ?? String(e)))
      }
    }
    start()
    return () => {
      // 画面を離れる時のみ停止（フェーズ切替では維持）
    }
  }, [phase])

  // クリーンアップ
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // 推論ループ
  const loop = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop)
      return
    }
    const tMs = performance.now()
    // タイムスタンプは単調増加が必須
    const ts = Math.max(lastTsRef.current + 1, Math.floor(tMs))
    lastTsRef.current = ts
    try {
      const frame = await detectVideoFrame(videoRef.current, ts)
      setPreviewLm(frame)
      if (recording) {
        const rel = (performance.now() - recordStartRef.current) / 1000
        framesRef.current.push({ ...frame, tSec: rel })
      }
    } catch {
      // 個別フレーム失敗は無視
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  // 録画フェーズに入ったら推論ループ開始
  useEffect(() => {
    if (phase !== 'CAMERA_SETUP' && phase !== 'RECORDING') return
    if (!modelReady) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, modelReady, recording])

  // 経過秒
  useEffect(() => {
    if (!recording) return
    const tid = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - recordStartRef.current) / 1000))
    }, 250)
    return () => clearInterval(tid)
  }, [recording])

  const startRecording = () => {
    framesRef.current = []
    recordStartRef.current = Date.now()
    setElapsed(0)
    setRecording(true)
  }

  const stopRecordingAndAnalyze = async () => {
    setRecording(false)
    setPhase('ANALYZING')
    setAnalysisProgress(20)
    // バックグラウンドで解析
    setTimeout(async () => {
      try {
        const frames = framesRef.current
        setAnalysisProgress(50)
        const analysis = analyzeSession(shot, side, frames)
        setAnalysisProgress(80)
        const saved: SavedFrame[] = compressFrames(frames, 240)
        const lessonId = randomId()
        const report: LessonReport = {
          lessonId,
          shot,
          side,
          durationSeconds: elapsed,
          swingCount: analysis.swingCount,
          overallScore: analysis.overallScore,
          coachingText: analysis.coachingText,
          checkpoints: analysis.checkpoints,
          drills: analysis.drills,
          impactPoints: analysis.impactPoints,
          frames: saved,
          createdAt: Date.now(),
        }
        await saveLessonReport(report)
        setAnalysisProgress(100)
        nav(`/lesson/${lessonId}`, { replace: true })
      } catch (e: any) {
        setError('解析失敗：' + (e?.message ?? String(e)))
        setPhase('CAMERA_SETUP')
      }
    }, 100)
  }

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">個人レッスン（AI 骨格診断）</h1>
          <p className="text-xs text-gray-400">
            {phase === 'SELECT_SHOT' && 'ショットを選んでください'}
            {phase === 'CAMERA_SETUP' && 'カメラを構えて準備'}
            {phase === 'RECORDING' && '解析中...'}
            {phase === 'ANALYZING' && 'AI 解析中...'}
          </p>
        </div>
      </header>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm">
          ⚠️ {error}
        </div>
      )}

      {phase === 'SELECT_SHOT' && (
        <ShotSelector shot={shot} setShot={setShot} side={side} setSide={setSide}
          onNext={() => setPhase('CAMERA_SETUP')} />
      )}

      {(phase === 'CAMERA_SETUP' || phase === 'RECORDING') && (
        <CameraPanel
          videoRef={videoRef}
          previewLm={previewLm}
          modelReady={modelReady}
          recording={recording}
          elapsed={elapsed}
          framesCount={framesRef.current.length}
          onStart={startRecording}
          onStop={stopRecordingAndAnalyze}
        />
      )}

      {phase === 'ANALYZING' && (
        <div className="text-center py-12 space-y-2">
          <div className="text-5xl">🤖</div>
          <div className="text-white">AI が骨格を解析中...</div>
          <div className="w-full bg-court-card rounded-full h-2 overflow-hidden">
            <div className="bg-court-accent h-full transition-all"
              style={{ width: `${analysisProgress}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function ShotSelector({ shot, setShot, side, setSide, onNext }: {
  shot: Shot; setShot: (s: Shot) => void;
  side: 'RIGHT' | 'LEFT'; setSide: (s: 'RIGHT' | 'LEFT') => void;
  onNext: () => void;
}) {
  const shots: Shot[] = ['FOREHAND', 'BACKHAND_ONE_HANDED', 'BACKHAND_TWO_HANDED',
    'SERVE', 'VOLLEY', 'SLICE', 'SMASH']
  return (
    <div className="space-y-4">
      <div className="bg-blue-950/60 rounded-xl p-3 text-xs">
        💡 <strong>撮影のコツ</strong>：体の真横に三脚で設置（コートサイドのフェンス利用が便利）。
        全身が映る距離で、利き腕側を真横から撮影すると診断精度が上がります。
      </div>

      <div>
        <div className="text-sm text-gray-400 mb-2">練習するショット</div>
        <div className="grid grid-cols-2 gap-2">
          {shots.map(s => (
            <button key={s}
              onClick={() => setShot(s)}
              className={`rounded-xl p-3 text-left flex items-center gap-2 transition ${
                shot === s ? 'bg-green-700 ring-2 ring-court-accent' : 'bg-court-card'
              }`}
            >
              <span className="text-2xl">{SHOT_EMOJI[s]}</span>
              <span className="text-sm font-bold">{SHOT_LABEL[s]}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm text-gray-400 mb-2">利き手</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSide('RIGHT')}
            className={`rounded-xl py-2 ${side === 'RIGHT' ? 'bg-green-700' : 'bg-court-card'}`}>
            右利き
          </button>
          <button onClick={() => setSide('LEFT')}
            className={`rounded-xl py-2 ${side === 'LEFT' ? 'bg-green-700' : 'bg-court-card'}`}>
            左利き
          </button>
        </div>
      </div>

      <button onClick={onNext}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl active:scale-95 transition">
        カメラを準備 →
      </button>
    </div>
  )
}

function CameraPanel({ videoRef, previewLm, modelReady, recording, elapsed, framesCount, onStart, onStop }: {
  videoRef: React.RefObject<HTMLVideoElement>;
  previewLm: PoseFrame | null;
  modelReady: boolean;
  recording: boolean;
  elapsed: number;
  framesCount: number;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <SkeletonOverlay
          landmarks={previewLm?.landmarks ?? null}
          width={640} height={360}
        />
        {recording && (
          <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 flex items-center gap-1">
            <span className="w-2 h-2 bg-court-danger rounded-full animate-pulse" />
            <span className="text-court-danger text-xs font-bold">REC {elapsed}s</span>
          </div>
        )}
        {!modelReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center">
              <div className="animate-spin text-4xl">⚙️</div>
              <div className="text-xs text-gray-300 mt-2">AI モデルをロード中...</div>
            </div>
          </div>
        )}
      </div>

      {recording && (
        <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center">
          <Stat label="経過" value={`${elapsed}秒`} />
          <Stat label="フレーム" value={`${framesCount}`} />
          <Stat label="検知" value={previewLm?.landmarks ? '✓' : '—'} />
        </div>
      )}

      {!recording ? (
        <button onClick={onStart} disabled={!modelReady}
          className="w-full bg-green-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl active:scale-95 transition">
          ⏺ 録画開始（スイングを繰り返してください）
        </button>
      ) : (
        <button onClick={onStop}
          className="w-full bg-red-700 text-white font-bold py-3 rounded-xl active:scale-95 transition">
          ⏹ 録画停止 → AI 診断
        </button>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-black text-court-accent">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}

function compressFrames(frames: PoseFrame[], maxFrames: number): SavedFrame[] {
  if (frames.length === 0) return []
  const step = Math.max(1, Math.floor(frames.length / maxFrames))
  const out: SavedFrame[] = []
  for (let i = 0; i < frames.length; i += step) {
    const f = frames[i]
    if (!f.landmarks) continue
    const lm: Record<number, [number, number]> = {}
    for (const k of KEY_LANDMARKS) {
      const p = f.landmarks[k]
      if (p) lm[k] = [p.x, p.y]
    }
    out.push({ tSec: f.tSec, lm })
  }
  return out
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
