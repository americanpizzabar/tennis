import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  detectVideoFrame, PoseFrame, warmupPoseModel, resetSmoothing,
  setPoseQuality, PoseQuality,
} from '../lib/poseDetector'
import { SkeletonOverlay } from '../components/SkeletonOverlay'
import { Shot, SHOT_EMOJI, SHOT_LABEL } from '../data/idealForms'
import { analyzeSession } from '../lib/coachingFeedback'
import { saveLessonReport } from '../lib/db'
import type { LessonReport, SavedFrame } from '../types/lesson'
import { KEY_LANDMARKS } from '../types/lesson'

/** MediaRecorder で使える最適な MIME を選ぶ。 */
function pickVideoMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

type Source = 'LIVE' | 'UPLOAD'
type Phase =
  | 'SELECT_SHOT'
  | 'SELECT_SOURCE'
  | 'CAMERA_SETUP'
  | 'RECORDING'
  | 'UPLOAD_PICK'
  | 'UPLOAD_PROCESSING'
  | 'ANALYZING'

export function LessonPage() {
  const nav = useNavigate()
  const [phase, setPhase] = useState<Phase>('SELECT_SHOT')
  const [shot, setShot] = useState<Shot>('FOREHAND')
  const [side, setSide] = useState<'RIGHT' | 'LEFT'>('RIGHT')
  const [source, setSource] = useState<Source>('LIVE')
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [previewLm, setPreviewLm] = useState<PoseFrame | null>(null)
  const [modelReady, setModelReady] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)

  // アップロード処理用
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadFileName, setUploadFileName] = useState<string | null>(null)
  const cancelRef = useRef(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const framesRef = useRef<PoseFrame[]>([])
  const rafRef = useRef<number | null>(null)
  const recordStartRef = useRef(0)
  const lastTsRef = useRef(0)

  // MediaRecorder（撮影しながら実映像も保存）
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordedBlobRef = useRef<{ blob: Blob; mime: string } | null>(null)
  const [pendingQuality, setPendingQuality] = useState<PoseQuality>('HIGH')

  // ── モデルウォームアップ（カメラ／アップロード両モードで必要） ──
  useEffect(() => {
    const needsModel =
      phase === 'CAMERA_SETUP' || phase === 'RECORDING' ||
      phase === 'UPLOAD_PICK' || phase === 'UPLOAD_PROCESSING'
    if (!needsModel) return
    setPoseQuality(pendingQuality)
    setModelReady(false)
    warmupPoseModel().then(() => setModelReady(true)).catch(e => {
      setError('AI モデルのロードに失敗しました：' + (e?.message ?? String(e)))
    })
  }, [phase, pendingQuality])

  // ── カメラ起動（ライブモードのみ） ──
  useEffect(() => {
    if (source !== 'LIVE') return
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
  }, [phase, source])

  // ── クリーンアップ ──
  useEffect(() => () => {
    cancelRef.current = true
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      try { mr.stop() } catch { /* noop */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl)
  }, [uploadedUrl])

  // ── ライブカメラ用：推論ループ ──
  const loop = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop)
      return
    }
    const tMs = performance.now()
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

  useEffect(() => {
    if (source !== 'LIVE') return
    if (phase !== 'CAMERA_SETUP' && phase !== 'RECORDING') return
    if (!modelReady) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, modelReady, recording, source])

  // ── 経過秒（ライブ録画用） ──
  useEffect(() => {
    if (!recording) return
    const tid = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - recordStartRef.current) / 1000))
    }, 250)
    return () => clearInterval(tid)
  }, [recording])

  // ── ライブ録画 開始／停止 ──
  const startRecording = () => {
    framesRef.current = []
    recordedChunksRef.current = []
    recordedBlobRef.current = null
    recordStartRef.current = Date.now()
    resetSmoothing()    // 録画開始時にスムージング履歴をクリア
    setElapsed(0)
    setRecording(true)

    // MediaRecorder で実映像を同時録画（撮影しながら解析）
    const stream = streamRef.current
    if (stream && typeof MediaRecorder !== 'undefined') {
      const mime = pickVideoMime()
      try {
        const mr = mime
          ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
          : new MediaRecorder(stream)
        mr.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data)
        }
        mr.onstop = () => {
          const actualMime = mr.mimeType || mime || 'video/webm'
          const blob = new Blob(recordedChunksRef.current, { type: actualMime })
          recordedBlobRef.current = { blob, mime: actualMime }
        }
        mr.start(250)   // 250ms ごとに chunk 取得
        mediaRecorderRef.current = mr
      } catch {
        // MediaRecorder 非対応でも解析は続行（映像保存だけスキップ）
        mediaRecorderRef.current = null
      }
    }
  }

  const stopRecordingAndAnalyze = async () => {
    setRecording(false)
    // MediaRecorder 停止 → blob 確定を待つ
    const mr = mediaRecorderRef.current
    if (mr && mr.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        const prev = mr.onstop
        mr.onstop = (ev) => {
          if (typeof prev === 'function') (prev as any).call(mr, ev)
          resolve()
        }
        mr.stop()
      })
      mediaRecorderRef.current = null
    }
    await runAnalysisAndSave(elapsed)
  }

  // ── 動画アップロード処理 ──
  const onFilePicked = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      setError('動画ファイルを選択してください（mp4, mov など）。')
      return
    }
    if (uploadedUrl) URL.revokeObjectURL(uploadedUrl)
    const url = URL.createObjectURL(file)
    setUploadedUrl(url)
    setUploadFileName(file.name)
    setError(null)
    setPhase('UPLOAD_PROCESSING')
  }

  // ── 動画アップロード：UPLOAD_PROCESSING に入ったら自動処理開始 ──
  useEffect(() => {
    if (phase !== 'UPLOAD_PROCESSING' || !uploadedUrl || !modelReady) return
    let cancelled = false
    cancelRef.current = false
    const process = async () => {
      if (!videoRef.current) return
      const video = videoRef.current
      framesRef.current = []
      setUploadProgress(0)
      lastTsRef.current = 0

      try {
        // 動画をロード
        video.srcObject = null
        video.src = uploadedUrl
        video.muted = true
        video.playsInline = true
        // 高速処理のため再生速度を上げる
        video.playbackRate = 2

        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            video.removeEventListener('loadedmetadata', onLoaded)
            video.removeEventListener('error', onErr)
            resolve()
          }
          const onErr = () => {
            video.removeEventListener('loadedmetadata', onLoaded)
            video.removeEventListener('error', onErr)
            reject(new Error('動画のロードに失敗しました'))
          }
          video.addEventListener('loadedmetadata', onLoaded)
          video.addEventListener('error', onErr)
        })

        const duration = video.duration
        if (!isFinite(duration) || duration <= 0) {
          throw new Error('動画の長さを取得できません')
        }

        await video.play()

        // 再生中にフレームを取得
        await new Promise<void>((resolve) => {
          let lastSampleMs = -1
          const step = async () => {
            if (cancelled || cancelRef.current) { resolve(); return }
            if (video.ended || video.paused) { resolve(); return }
            const tSec = video.currentTime
            const tMs = Math.floor(tSec * 1000)
            // 同じ ms が何度も来るのを防ぐ
            if (tMs > lastSampleMs) {
              lastSampleMs = tMs
              const ts = Math.max(lastTsRef.current + 1, tMs)
              lastTsRef.current = ts
              try {
                const frame = await detectVideoFrame(video, ts)
                framesRef.current.push({ ...frame, tSec })
                setPreviewLm(frame)
              } catch {
                // 単フレーム失敗は無視
              }
              setUploadProgress(Math.min(99, Math.round((tSec / duration) * 100)))
            }
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        })

        if (cancelled || cancelRef.current) return
        setUploadProgress(100)

        if (framesRef.current.length === 0) {
          throw new Error('骨格を検出できませんでした。体全体が映る動画でお試しください。')
        }
        await runAnalysisAndSave(Math.round(duration))
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? String(e))
          setPhase('UPLOAD_PICK')
        }
      }
    }
    process()
    return () => { cancelled = true }
  }, [phase, uploadedUrl, modelReady])

  // ── 解析＋保存（ライブ／アップロード共通） ──
  const runAnalysisAndSave = async (durationSec: number) => {
    setPhase('ANALYZING')
    setAnalysisProgress(20)
    await new Promise(r => setTimeout(r, 50))
    try {
      const frames = framesRef.current
      setAnalysisProgress(50)
      const analysis = analyzeSession(shot, side, frames)
      setAnalysisProgress(80)
      const saved: SavedFrame[] = compressFrames(frames, 240)
      const lessonId = randomId()
      const recorded = recordedBlobRef.current
      const report: LessonReport = {
        lessonId,
        shot,
        side,
        durationSeconds: durationSec,
        swingCount: analysis.swingCount,
        overallScore: analysis.overallScore,
        coachingText: analysis.coachingText,
        checkpoints: analysis.checkpoints,
        drills: analysis.drills,
        impactPoints: analysis.impactPoints,
        frames: saved,
        videoBlob: recorded?.blob,
        videoMime: recorded?.mime,
        createdAt: Date.now(),
      }
      await saveLessonReport(report)
      recordedBlobRef.current = null
      setAnalysisProgress(100)
      nav(`/lesson/${lessonId}`, { replace: true })
    } catch (e: any) {
      setError('解析失敗：' + (e?.message ?? String(e)))
      setPhase(source === 'LIVE' ? 'CAMERA_SETUP' : 'UPLOAD_PICK')
    }
  }

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">個人レッスン（AI 骨格診断）</h1>
          <p className="text-xs text-gray-400">
            {phase === 'SELECT_SHOT' && 'ショットを選んでください'}
            {phase === 'SELECT_SOURCE' && '解析する映像のソースを選択'}
            {phase === 'CAMERA_SETUP' && 'カメラを構えて準備'}
            {phase === 'RECORDING' && '録画中...'}
            {phase === 'UPLOAD_PICK' && '動画ファイルを選択'}
            {phase === 'UPLOAD_PROCESSING' && '動画を解析中...'}
            {phase === 'ANALYZING' && 'AI 診断生成中...'}
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
          onNext={() => setPhase('SELECT_SOURCE')} />
      )}

      {phase === 'SELECT_SOURCE' && (
        <SourceSelector
          onLive={() => { setSource('LIVE'); setPhase('CAMERA_SETUP') }}
          onUpload={() => { setSource('UPLOAD'); setPhase('UPLOAD_PICK') }}
        />
      )}

      {(phase === 'CAMERA_SETUP' || phase === 'RECORDING') && source === 'LIVE' && (
        <CameraPanel
          videoRef={videoRef}
          previewLm={previewLm}
          modelReady={modelReady}
          recording={recording}
          elapsed={elapsed}
          framesCount={framesRef.current.length}
          quality={pendingQuality}
          onQualityChange={setPendingQuality}
          onStart={startRecording}
          onStop={stopRecordingAndAnalyze}
        />
      )}

      {phase === 'UPLOAD_PICK' && (
        <UploadPanel
          modelReady={modelReady}
          onFilePicked={onFilePicked}
          previousFileName={uploadFileName}
        />
      )}

      {phase === 'UPLOAD_PROCESSING' && (
        <UploadProcessingPanel
          videoRef={videoRef}
          previewLm={previewLm}
          progress={uploadProgress}
          framesCount={framesRef.current.length}
          fileName={uploadFileName}
          onCancel={() => {
            cancelRef.current = true
            setPhase('UPLOAD_PICK')
          }}
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
        💡 <strong>撮影のコツ</strong>：体の真横から、利き腕側を映すと診断精度が上がります。
        全身が映る距離で、できるだけ三脚などで固定。
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
        次へ →
      </button>
    </div>
  )
}

function SourceSelector({ onLive, onUpload }: {
  onLive: () => void; onUpload: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-400">解析するソースを選択してください</div>
      <button onClick={onLive}
        className="w-full bg-court-card hover:bg-emerald-900 rounded-xl p-4 flex items-center gap-3 transition active:scale-[0.98] text-left">
        <span className="text-3xl">📹</span>
        <div className="flex-1">
          <div className="font-bold">ライブカメラで撮影</div>
          <div className="text-xs text-gray-400">
            撮影しながらリアルタイム解析＋実映像も保存（後で見返せる）
          </div>
        </div>
        <span className="text-gray-500">›</span>
      </button>
      <button onClick={onUpload}
        className="w-full bg-court-card hover:bg-emerald-900 rounded-xl p-4 flex items-center gap-3 transition active:scale-[0.98] text-left">
        <span className="text-3xl">📁</span>
        <div className="flex-1">
          <div className="font-bold">動画ファイルをアップロード</div>
          <div className="text-xs text-gray-400">
            すでに撮影した動画（mp4, mov 等）を選んで解析
          </div>
        </div>
        <span className="text-gray-500">›</span>
      </button>
      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
        💡 <strong>ヒント</strong>：いつもの練習を 10〜30 秒ほど撮影した動画でも十分解析できます。
        動画は端末からはアップロードされず、ブラウザ内だけで処理されます（プライバシー保護）。
      </div>
    </div>
  )
}

function CameraPanel({
  videoRef, previewLm, modelReady, recording, elapsed, framesCount,
  quality, onQualityChange, onStart, onStop,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  previewLm: PoseFrame | null;
  modelReady: boolean;
  recording: boolean;
  elapsed: number;
  framesCount: number;
  quality: PoseQuality;
  onQualityChange: (q: PoseQuality) => void;
  onStart: () => void;
  onStop: () => void;
}) {
  const detected = !!previewLm?.landmarks
  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-contain" />
        <SkeletonOverlay
          landmarks={previewLm?.landmarks ?? null}
          videoRef={videoRef}
          objectFit="contain"
        />
        {recording && (
          <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 flex items-center gap-1">
            <span className="w-2 h-2 bg-court-danger rounded-full animate-pulse" />
            <span className="text-court-danger text-xs font-bold">● REC {elapsed}s ・ 解析中</span>
          </div>
        )}
        {/* 検知状態を常時表示 */}
        <div className="absolute top-2 right-2 bg-black/60 rounded px-2 py-1">
          <span className={`text-xs font-bold ${detected ? 'text-court-accent' : 'text-gray-400'}`}>
            {detected ? '骨格検知中 ✓' : '骨格を探しています…'}
          </span>
        </div>
        {!modelReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-center">
              <div className="animate-spin text-4xl">⚙️</div>
              <div className="text-xs text-gray-300 mt-2">
                AI モデルをロード中...{quality === 'HIGH' ? '（高精度）' : '（高速）'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 精度モード切替（録画前のみ） */}
      {!recording && (
        <div className="bg-court-card rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-2">骨格検知の精度</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onQualityChange('HIGH')}
              className={`py-2 rounded text-sm font-bold ${
                quality === 'HIGH' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'
              }`}>
              🎯 高精度
            </button>
            <button onClick={() => onQualityChange('FAST')}
              className={`py-2 rounded text-sm font-bold ${
                quality === 'FAST' ? 'bg-court-info text-white' : 'bg-court-surface text-gray-300'
              }`}>
              ⚡ 高速
            </button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {quality === 'HIGH'
              ? '高精度モデル（full）＋ジッタ抑制。新しめの端末向け。'
              : '軽量モデル（lite）。動作が重い端末はこちら。'}
          </div>
        </div>
      )}

      {recording && (
        <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center">
          <Stat label="経過" value={`${elapsed}秒`} />
          <Stat label="フレーム" value={`${framesCount}`} />
          <Stat label="検知" value={detected ? '✓' : '—'} />
        </div>
      )}

      {!recording ? (
        <button onClick={onStart} disabled={!modelReady}
          className="w-full bg-green-700 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl active:scale-95 transition">
          ⏺ 録画開始（撮影しながら解析します）
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

function UploadPanel({ modelReady, onFilePicked, previousFileName }: {
  modelReady: boolean;
  onFilePicked: (file: File) => void;
  previousFileName: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-3">
      <div className="bg-court-card rounded-xl p-4">
        <div className="text-court-warning font-bold text-sm mb-2">📁 動画ファイルを選択</div>
        <div className="text-xs text-gray-400 mb-4 leading-relaxed">
          mp4 / mov / webm 等の動画ファイルを選んでください。
          目安 5〜60 秒、解像度 720p 程度が推奨です。<br />
          長すぎる動画は処理時間がかかります（再生速度の 2 倍で解析します）。
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFilePicked(f)
            e.target.value = ''
          }}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={!modelReady}
          className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white font-bold py-3 rounded-xl active:scale-95 transition"
        >
          📂 動画ファイルを選ぶ
        </button>
        {!modelReady && (
          <div className="text-center text-xs text-gray-400 mt-2">
            AI モデルをロード中... 完了後にアップロード可能になります
          </div>
        )}
        {previousFileName && (
          <div className="text-xs text-gray-500 mt-2 truncate">
            前回：{previousFileName}
          </div>
        )}
      </div>
      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
        🎬 <strong>撮影のコツ</strong>：
        体の真横、全身が映る距離、横向きの動画がベスト。
        同じショットを 5 本以上含めるとスイングのばらつき診断が可能になります。
      </div>
    </div>
  )
}

function UploadProcessingPanel({ videoRef, previewLm, progress, framesCount, fileName, onCancel }: {
  videoRef: React.RefObject<HTMLVideoElement>;
  previewLm: PoseFrame | null;
  progress: number;
  framesCount: number;
  fileName: string | null;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video ref={videoRef} playsInline muted
          className="absolute inset-0 w-full h-full object-contain" />
        <SkeletonOverlay
          landmarks={previewLm?.landmarks ?? null}
          videoRef={videoRef}
          objectFit="contain"
        />
        <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 flex items-center gap-1">
          <span className="w-2 h-2 bg-court-warning rounded-full animate-pulse" />
          <span className="text-court-warning text-xs font-bold">解析中 {progress}%</span>
        </div>
      </div>

      <div className="w-full bg-court-card rounded-full h-2 overflow-hidden">
        <div className="bg-court-accent h-full transition-all"
          style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center">
        <Stat label="進捗" value={`${progress}%`} />
        <Stat label="フレーム" value={`${framesCount}`} />
        <Stat label="検知" value={previewLm?.landmarks ? '✓' : '—'} />
      </div>

      {fileName && (
        <div className="text-xs text-gray-400 text-center truncate">{fileName}</div>
      )}

      <button
        onClick={onCancel}
        className="w-full bg-court-card hover:bg-red-900 text-court-danger font-bold py-2 rounded-xl active:scale-95 transition"
      >
        ✕ キャンセル
      </button>
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
