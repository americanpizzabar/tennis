import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SyncSession, type Role, type CameraRole, type ConnState, type ReceivedVideo,
} from '../lib/syncSession'
import { saveSyncSession } from '../lib/db'
import type { SyncClip, SyncSessionRecord } from '../types/sync'

function pickVideoMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm',
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const CAMERA_LABEL: Record<CameraRole, string> = {
  BACK: '後方カメラ（全体俯瞰）',
  SIDE: 'サイドカメラ（打点・フォーム）',
}

type Step =
  | 'PICK_ROLE'
  | 'HOST_OFFER'        // offer 表示→answer 待ち
  | 'GUEST_OFFER_IN'    // offer 入力→answer 表示
  | 'LOBBY'             // 接続済み・録画前
  | 'RECORDING'
  | 'TRANSFER'          // 動画交換中
  | 'DONE'

export function SyncCapturePage() {
  const nav = useNavigate()
  const [step, setStep] = useState<Step>('PICK_ROLE')
  const [role, setRole] = useState<Role>('HOST')
  const [myCamera, setMyCamera] = useState<CameraRole>('BACK')
  const [connState, setConnState] = useState<ConnState>('IDLE')
  const [error, setError] = useState<string | null>(null)

  // シグナリングコード
  const [offerCode, setOfferCode] = useState('')
  const [answerCode, setAnswerCode] = useState('')
  const [pasteCode, setPasteCode] = useState('')

  // 時計同期
  const [offsetMs, setOffsetMs] = useState<number | null>(null)
  const [rttMs, setRttMs] = useState<number | null>(null)

  // 録画
  const [elapsed, setElapsed] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [sendProg, setSendProg] = useState(0)
  const [recvProg, setRecvProg] = useState(0)

  const sessionRef = useRef<SyncSession | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // 録画結果の集約（自分のクリップ＋相手のクリップ）
  const localClipRef = useRef<SyncClip | null>(null)
  const remoteClipRef = useRef<ReceivedVideo | null>(null)
  const recordStartLocalRef = useRef(0)
  const startTimerRef = useRef<number | null>(null)
  const recElapsedTimerRef = useRef<number | null>(null)
  const savedRef = useRef(false)

  // ── カメラ起動 ──
  useEffect(() => {
    if (step === 'PICK_ROLE') return
    if (streamRef.current) return
    navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
      audio: true,   // 音声があると後で同期検証にも使える
    }).then(stream => {
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => { /* noop */ })
      }
    }).catch(e => setError('カメラへのアクセスに失敗：' + (e?.message ?? String(e))))
  }, [step])

  // ── クリーンアップ ──
  useEffect(() => () => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current)
    if (recElapsedTimerRef.current) clearInterval(recElapsedTimerRef.current)
    const mr = mrRef.current
    if (mr && mr.state !== 'inactive') { try { mr.stop() } catch { /* noop */ } }
    streamRef.current?.getTracks().forEach(t => t.stop())
    sessionRef.current?.close()
  }, [])

  // ── SyncSession 構築（イベント配線） ──
  const buildSession = (r: Role): SyncSession => {
    const s = new SyncSession(r, {
      onState: setConnState,
      onClockSynced: (off, rtt) => { setOffsetMs(off); setRttMs(rtt) },
      onRole: (cam) => setMyCamera(cam),
      onStart: (atEpoch) => scheduleRecording(atEpoch),
      onStop: () => stopRecording(),
      onSendProgress: setSendProg,
      onReceiveProgress: setRecvProg,
      onVideoReceived: (v) => {
        remoteClipRef.current = v
        tryAssemble()
      },
    })
    sessionRef.current = s
    return s
  }

  // ── ロール選択 ──
  const chooseHost = async () => {
    setRole('HOST'); setMyCamera('BACK'); setError(null)
    const s = buildSession('HOST')
    try {
      const code = await s.createOffer()
      setOfferCode(code)
      setStep('HOST_OFFER')
    } catch (e: any) {
      setError('offer 生成に失敗：' + (e?.message ?? String(e)))
    }
  }
  const chooseGuest = () => {
    setRole('GUEST'); setMyCamera('SIDE'); setError(null)
    buildSession('GUEST')
    setStep('GUEST_OFFER_IN')
  }

  // HOST：相手の answer を貼り付けて接続確定
  const submitAnswer = async () => {
    try {
      await sessionRef.current!.acceptAnswer(pasteCode)
      setPasteCode('')
      setStep('LOBBY')
      // ホストはカメラ役割を相手に通知
      sessionRef.current!.assignGuestCamera(myCamera === 'BACK' ? 'SIDE' : 'BACK')
    } catch (e: any) {
      setError('answer の適用に失敗：コードを確認してください。')
    }
  }

  // GUEST：相手の offer を貼り付けて answer 生成
  const submitOffer = async () => {
    try {
      const code = await sessionRef.current!.createAnswer(pasteCode)
      setAnswerCode(code)
      setPasteCode('')
    } catch (e: any) {
      setError('offer の処理に失敗：コードを確認してください。')
    }
  }

  // 接続完了 → LOBBY へ（GUEST 側）
  useEffect(() => {
    if (connState === 'CONNECTED' && (step === 'GUEST_OFFER_IN' || step === 'HOST_OFFER')) {
      setStep('LOBBY')
    }
  }, [connState, step])

  // ── 録画スケジューリング（両端末で同一の壁時計時刻に開始） ──
  const scheduleRecording = (hostAtEpoch: number) => {
    const s = sessionRef.current
    if (!s) return
    const localStart = s.hostEpochToLocal(hostAtEpoch)   // 自分のローカル時計に変換
    const delay = Math.max(0, localStart - Date.now())
    setStep('RECORDING')
    setCountdown(Math.ceil(delay / 1000))
    const cdTimer = window.setInterval(() => {
      const remain = localStart - Date.now()
      if (remain <= 0) { clearInterval(cdTimer); setCountdown(null) }
      else setCountdown(Math.ceil(remain / 1000))
    }, 200)
    if (startTimerRef.current) clearTimeout(startTimerRef.current)
    startTimerRef.current = window.setTimeout(() => beginLocalRecording(), delay)
  }

  const beginLocalRecording = () => {
    const stream = streamRef.current
    if (!stream) { setError('カメラ未準備のため録画できません'); return }
    chunksRef.current = []
    const mime = pickVideoMime()
    try {
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
        : new MediaRecorder(stream)
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstart = () => { recordStartLocalRef.current = Date.now() }
      mr.start(250)
      mrRef.current = mr
    } catch (e: any) {
      setError('録画開始に失敗：' + (e?.message ?? String(e)))
      return
    }
    setElapsed(0)
    if (recElapsedTimerRef.current) clearInterval(recElapsedTimerRef.current)
    recElapsedTimerRef.current = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - recordStartLocalRef.current) / 1000))
    }, 250)
  }

  // ── 停止（HOST がボタン→broadcastStop、両者 stopRecording） ──
  const onTapStop = () => {
    sessionRef.current?.broadcastStop()
    stopRecording()
  }

  const stopRecording = () => {
    if (startTimerRef.current) { clearTimeout(startTimerRef.current); startTimerRef.current = null }
    if (recElapsedTimerRef.current) { clearInterval(recElapsedTimerRef.current); recElapsedTimerRef.current = null }
    const mr = mrRef.current
    const s = sessionRef.current
    if (!mr || mr.state === 'inactive' || !s) { setStep('TRANSFER'); return }
    mr.onstop = async () => {
      const actualMime = mr.mimeType || pickVideoMime() || 'video/webm'
      const blob = new Blob(chunksRef.current, { type: actualMime })
      const durationSec = Math.max(0.1, (Date.now() - recordStartLocalRef.current) / 1000)
      // 実際の録画開始をホスト基準 epoch に変換して記録（=同期の基準点）
      const startEpochHost = role === 'HOST'
        ? recordStartLocalRef.current
        : recordStartLocalRef.current - s.clockOffsetMs
      localClipRef.current = {
        blob, mime: actualMime, durationSec, cameraRole: myCamera, startEpoch: startEpochHost,
      }
      setStep('TRANSFER')
      try {
        await s.sendVideo(blob, actualMime, durationSec, myCamera, startEpochHost)
      } catch (e: any) {
        setError('動画の送信に失敗：' + (e?.message ?? String(e)))
      }
      tryAssemble()
    }
    mr.stop()
    mrRef.current = null
  }

  // ── 両クリップが揃ったら保存して再生へ ──
  const tryAssemble = async () => {
    if (savedRef.current) return
    const local = localClipRef.current
    const remote = remoteClipRef.current
    if (!local || !remote) return
    savedRef.current = true

    const localClip: SyncClip = local
    const remoteClip: SyncClip = {
      blob: remote.blob, mime: remote.mime, durationSec: remote.durationSec,
      cameraRole: remote.cameraRole, startEpoch: remote.startEpoch,
    }
    const clips = [localClip, remoteClip]
    const back = clips.find(c => c.cameraRole === 'BACK')
    const side = clips.find(c => c.cameraRole === 'SIDE')
    const startSkewMs = back && side ? back.startEpoch - side.startEpoch : 0

    const rec: SyncSessionRecord = {
      id: randomId(),
      createdAt: Date.now(),
      title: `同期撮影 ${new Date().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      back, side, startSkewMs,
      syncRttMs: rttMs ?? undefined,
    }
    try {
      await saveSyncSession(rec)
      setStep('DONE')
      setTimeout(() => nav(`/sync/${rec.id}`, { replace: true }), 600)
    } catch (e: any) {
      setError('保存に失敗：' + (e?.message ?? String(e)))
    }
  }

  // ── UI ──
  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">マルチアングル同期撮影</h1>
          <p className="text-xs text-gray-400">2 台のスマホで後方＋サイドを同時録画</p>
        </div>
        <ConnBadge state={connState} />
      </header>

      {error && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg p-3 text-sm">⚠️ {error}</div>
      )}

      {step === 'PICK_ROLE' && (
        <RolePicker onHost={chooseHost} onGuest={chooseGuest} />
      )}

      {step === 'HOST_OFFER' && (
        <div className="space-y-3">
          <Info>
            ① このコードを <b>子機（サイド）</b> に渡してください（コピー → メッセージ等で共有）。<br />
            ② 子機が出した「応答コード」を下に貼り付けます。
          </Info>
          <CodeBox label="① 接続コード（子機へ渡す）" value={offerCode} />
          <PasteBox
            label="② 子機からの応答コードを貼り付け"
            value={pasteCode} onChange={setPasteCode} onSubmit={submitAnswer}
            submitLabel="接続する"
          />
        </div>
      )}

      {step === 'GUEST_OFFER_IN' && (
        <div className="space-y-3">
          <Info>
            ① 親機（後方）が出した「接続コード」を下に貼り付けます。<br />
            ② 生成された「応答コード」を親機に返してください。
          </Info>
          {!answerCode ? (
            <PasteBox
              label="① 親機の接続コードを貼り付け"
              value={pasteCode} onChange={setPasteCode} onSubmit={submitOffer}
              submitLabel="応答コードを生成"
            />
          ) : (
            <>
              <CodeBox label="② 応答コード（親機へ返す）" value={answerCode} />
              <div className="text-center text-xs text-gray-400">親機が接続すると自動で次に進みます…</div>
            </>
          )}
        </div>
      )}

      {(step === 'LOBBY' || step === 'RECORDING' || step === 'TRANSFER' || step === 'DONE') && (
        <>
          <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
            <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute top-2 left-2 bg-black/60 rounded px-2 py-1 text-xs font-bold text-court-accent">
              {CAMERA_LABEL[myCamera]}
            </div>
            {step === 'RECORDING' && countdown !== null && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="text-7xl font-black text-white animate-pulse">{countdown}</div>
              </div>
            )}
            {step === 'RECORDING' && countdown === null && (
              <div className="absolute top-2 right-2 bg-black/60 rounded px-2 py-1 flex items-center gap-1">
                <span className="w-2 h-2 bg-court-danger rounded-full animate-pulse" />
                <span className="text-court-danger text-xs font-bold">● REC {elapsed}s</span>
              </div>
            )}
          </div>

          <SyncQuality offsetMs={offsetMs} rttMs={rttMs} />

          {step === 'LOBBY' && (
            <LobbyControls
              role={role} myCamera={myCamera}
              onSwapCamera={() => {
                const next = myCamera === 'BACK' ? 'SIDE' : 'BACK'
                setMyCamera(next)
                sessionRef.current?.assignGuestCamera(next === 'BACK' ? 'SIDE' : 'BACK')
              }}
              onStart={() => {
                const at = sessionRef.current!.broadcastStart(2000)
                scheduleRecording(at)
              }}
            />
          )}

          {step === 'RECORDING' && role === 'HOST' && countdown === null && (
            <button onClick={onTapStop}
              className="w-full bg-red-700 text-white font-bold py-3 rounded-xl active:scale-95 transition">
              ⏹ 録画停止（両端末同時）
            </button>
          )}
          {step === 'RECORDING' && role === 'GUEST' && (
            <div className="text-center text-sm text-gray-400 py-2">
              親機の停止操作を待っています…（手動停止も可）
              <button onClick={onTapStop} className="block mx-auto mt-2 text-court-danger underline text-xs">
                今すぐ停止する
              </button>
            </div>
          )}

          {step === 'TRANSFER' && (
            <div className="space-y-2">
              <div className="text-center text-sm text-white">📤 2 視点の動画を交換中…</div>
              <ProgressBar label="送信" ratio={sendProg} />
              <ProgressBar label="受信" ratio={recvProg} />
              <div className="text-xs text-gray-500 text-center">
                どちらの端末にも「シンクロ済み 2 画面データ」が保存されます。
              </div>
            </div>
          )}

          {step === 'DONE' && (
            <div className="text-center py-8 space-y-2">
              <div className="text-5xl">✅</div>
              <div className="text-white font-bold">同期撮影が完了しました</div>
              <div className="text-xs text-gray-400">ツインスライダー再生に移動します…</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RolePicker({ onHost, onGuest }: { onHost: () => void; onGuest: () => void }) {
  return (
    <div className="space-y-3">
      <Info>
        2 台のスマホを連動させます。<b>1 台で「親機（後方）」</b>を選び、
        もう 1 台で<b>「子機（サイド）」</b>を選んでください。<br />
        ※ 同じ Wi-Fi に繋ぐと最も安定します（モバイル回線でも可）。
      </Info>
      <button onClick={onHost}
        className="w-full bg-court-card hover:bg-emerald-900 rounded-xl p-4 flex items-center gap-3 transition active:scale-[0.98] text-left">
        <span className="text-3xl">📡</span>
        <div className="flex-1">
          <div className="font-bold">親機になる（後方カメラ）</div>
          <div className="text-xs text-gray-400">コート全体を俯瞰。接続コードを発行します。</div>
        </div>
        <span className="text-gray-500">›</span>
      </button>
      <button onClick={onGuest}
        className="w-full bg-court-card hover:bg-emerald-900 rounded-xl p-4 flex items-center gap-3 transition active:scale-[0.98] text-left">
        <span className="text-3xl">📲</span>
        <div className="flex-1">
          <div className="font-bold">子機になる（サイドカメラ）</div>
          <div className="text-xs text-gray-400">打点・フォームを横から。接続コードを受け取ります。</div>
        </div>
        <span className="text-gray-500">›</span>
      </button>
    </div>
  )
}

function LobbyControls({ role, myCamera, onSwapCamera, onStart }: {
  role: Role; myCamera: CameraRole; onSwapCamera: () => void; onStart: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="bg-court-card rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400">この端末の役割</div>
          <div className="font-bold">{CAMERA_LABEL[myCamera]}</div>
        </div>
        {role === 'HOST' && (
          <button onClick={onSwapCamera}
            className="text-xs bg-court-surface px-3 py-1.5 rounded-lg text-court-info">
            ⇄ 入れ替え
          </button>
        )}
      </div>
      {role === 'HOST' ? (
        <button onClick={onStart}
          className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl active:scale-95 transition">
          ⏺ 2 台同時に録画開始（カウントダウン後）
        </button>
      ) : (
        <div className="text-center text-sm text-gray-400 py-2">
          親機が録画を開始すると、この端末も同時に録画します。
        </div>
      )}
    </div>
  )
}

function SyncQuality({ offsetMs, rttMs }: { offsetMs: number | null; rttMs: number | null }) {
  const quality = rttMs == null ? '—' : rttMs < 60 ? '優秀' : rttMs < 150 ? '良好' : '注意'
  const color = rttMs == null ? 'text-gray-400' : rttMs < 60 ? 'text-court-accent' : rttMs < 150 ? 'text-court-info' : 'text-court-warning'
  return (
    <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center text-xs">
      <div>
        <div className={`text-lg font-black ${color}`}>{quality}</div>
        <div className="text-gray-400">同期品質</div>
      </div>
      <div>
        <div className="text-lg font-black text-white">{rttMs == null ? '—' : `${Math.round(rttMs)}ms`}</div>
        <div className="text-gray-400">往復遅延</div>
      </div>
      <div>
        <div className="text-lg font-black text-white">{offsetMs == null ? '—' : `${Math.round(offsetMs)}ms`}</div>
        <div className="text-gray-400">時計ズレ</div>
      </div>
    </div>
  )
}

function ConnBadge({ state }: { state: ConnState }) {
  const map: Record<ConnState, [string, string]> = {
    IDLE: ['待機', 'bg-gray-700 text-gray-300'],
    CREATING_OFFER: ['準備中', 'bg-gray-700 text-gray-300'],
    WAITING_ANSWER: ['応答待ち', 'bg-yellow-800 text-yellow-200'],
    CREATING_ANSWER: ['準備中', 'bg-gray-700 text-gray-300'],
    CONNECTING: ['接続中', 'bg-yellow-800 text-yellow-200'],
    CONNECTED: ['接続済み', 'bg-green-800 text-court-accent'],
    FAILED: ['失敗', 'bg-red-800 text-red-200'],
    CLOSED: ['切断', 'bg-gray-700 text-gray-300'],
  }
  const [label, cls] = map[state]
  return <span className={`text-xs font-bold px-2 py-1 rounded ${cls}`}>{label}</span>
}

function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-blue-950/60 border border-court-info/30 rounded-xl p-3 text-xs text-white/90 leading-relaxed">
      💡 {children}
    </div>
  )
}

function CodeBox({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { /* noop */ }
  }
  return (
    <div className="bg-court-card rounded-xl p-3 space-y-2">
      <div className="text-xs text-gray-400">{label}</div>
      <textarea readOnly value={value}
        className="w-full h-20 text-[10px] bg-court-surface rounded p-2 font-mono text-gray-300 resize-none" />
      <button onClick={copy}
        className="w-full bg-court-info text-white text-sm font-bold py-2 rounded-lg active:scale-95 transition">
        {copied ? '✓ コピーしました' : '📋 コードをコピー'}
      </button>
    </div>
  )
}

function PasteBox({ label, value, onChange, onSubmit, submitLabel }: {
  label: string; value: string; onChange: (v: string) => void; onSubmit: () => void; submitLabel: string;
}) {
  return (
    <div className="bg-court-card rounded-xl p-3 space-y-2">
      <div className="text-xs text-gray-400">{label}</div>
      <textarea value={value} onChange={e => onChange(e.target.value)}
        placeholder="ここにコードを貼り付け…"
        className="w-full h-20 text-[10px] bg-court-surface rounded p-2 font-mono text-gray-200 resize-none" />
      <button onClick={onSubmit} disabled={!value.trim()}
        className="w-full bg-green-700 disabled:bg-gray-700 text-white text-sm font-bold py-2 rounded-lg active:scale-95 transition">
        {submitLabel}
      </button>
    </div>
  )
}

function ProgressBar({ label, ratio }: { label: string; ratio: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{label}</span><span>{Math.round(ratio * 100)}%</span>
      </div>
      <div className="w-full bg-court-card rounded-full h-2 overflow-hidden">
        <div className="bg-court-accent h-full transition-all" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}
