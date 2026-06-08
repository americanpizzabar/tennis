import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSyncSession, deleteSyncSession } from '../lib/db'
import type { SyncSessionRecord, SyncClip } from '../types/sync'

/**
 * ツインスライダー再生：
 *  - 後方カメラ（BACK）とサイドカメラ（SIDE）を 1 コマのズレなく同期再生。
 *  - 共通タイムライン T（ホスト基準 epoch ms）から各動画の currentTime を逆算。
 *  - 後方カメラをマスタークロックとし、サイドのドリフトを毎フレーム補正。
 */
export function SyncReplayPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [rec, setRec] = useState<SyncSessionRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDel, setConfirmDel] = useState(false)

  const backRef = useRef<HTMLVideoElement>(null)
  const sideRef = useRef<HTMLVideoElement>(null)
  const backUrlRef = useRef<string | null>(null)
  const sideUrlRef = useRef<string | null>(null)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [globalT, setGlobalT] = useState(0)   // ホスト基準 epoch ms
  const rafRef = useRef<number | null>(null)
  const [layoutMode, setLayoutMode] = useState<'SIDE_BY_SIDE' | 'STACKED'>('SIDE_BY_SIDE')

  useEffect(() => {
    if (!id) return
    getSyncSession(id).then(r => {
      setRec(r ?? null)
      setLoading(false)
    })
  }, [id])

  // 動画 URL を割り当て
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

  // ── 共通タイムラインの範囲（ホスト基準 epoch ms） ──
  const timeline = useMemo(() => {
    if (!rec) return null
    const clips: SyncClip[] = [rec.back, rec.side].filter(Boolean) as SyncClip[]
    if (clips.length === 0) return null
    const start = Math.min(...clips.map(c => c.startEpoch))
    const end = Math.max(...clips.map(c => c.startEpoch + c.durationSec * 1000))
    return { start, end, durationMs: end - start }
  }, [rec])

  // 初期位置を先頭に
  useEffect(() => {
    if (timeline) setGlobalT(timeline.start)
  }, [timeline])

  // ── currentTime を globalT に合わせる ──
  const seekTo = (t: number) => {
    if (!rec) return
    if (rec.back && backRef.current) {
      const ct = clampCT((t - rec.back.startEpoch) / 1000, rec.back.durationSec)
      if (Math.abs(backRef.current.currentTime - ct) > 0.04) backRef.current.currentTime = ct
    }
    if (rec.side && sideRef.current) {
      const ct = clampCT((t - rec.side.startEpoch) / 1000, rec.side.durationSec)
      if (Math.abs(sideRef.current.currentTime - ct) > 0.04) sideRef.current.currentTime = ct
    }
  }

  // ── 再生ループ（後方をマスター、サイドをドリフト補正） ──
  useEffect(() => {
    if (!playing || !rec || !timeline) return
    const tick = () => {
      const master = rec.back ? backRef.current : sideRef.current
      const masterClip = rec.back ?? rec.side
      if (master && masterClip) {
        const t = masterClip.startEpoch + master.currentTime * 1000
        setGlobalT(t)
        // サイドのドリフト補正
        if (rec.back && rec.side && sideRef.current) {
          const target = clampCT((t - rec.side.startEpoch) / 1000, rec.side.durationSec)
          if (Math.abs(sideRef.current.currentTime - target) > 0.08) {
            sideRef.current.currentTime = target
          }
        }
        if (t >= timeline.end - 30) { pause(); return }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rec, timeline])

  const play = () => {
    if (!rec) return
    seekTo(globalT)
    if (backRef.current) { backRef.current.playbackRate = speed; backRef.current.play().catch(() => {}) }
    if (sideRef.current) { sideRef.current.playbackRate = speed; sideRef.current.play().catch(() => {}) }
    setPlaying(true)
  }
  const pause = () => {
    backRef.current?.pause()
    sideRef.current?.pause()
    setPlaying(false)
  }
  const togglePlay = () => (playing ? pause() : play())

  const onScrub = (t: number) => {
    pause()
    setGlobalT(t)
    seekTo(t)
  }
  const nudge = (deltaMs: number) => {
    if (!timeline) return
    const t = Math.min(timeline.end, Math.max(timeline.start, globalT + deltaMs))
    onScrub(t)
  }

  const changeSpeed = (s: number) => {
    setSpeed(s)
    if (backRef.current) backRef.current.playbackRate = s
    if (sideRef.current) sideRef.current.playbackRate = s
  }

  if (loading) return <Center>読み込み中…</Center>
  if (!rec) return <Center>セッションが見つかりません</Center>

  const posSec = timeline ? (globalT - timeline.start) / 1000 : 0
  const durSec = timeline ? timeline.durationMs / 1000 : 0

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-28">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold text-sm">{rec.title}</h1>
          <p className="text-xs text-gray-400">
            ツインスライダー再生 ・ ズレ {Math.abs(Math.round(rec.startSkewMs))}ms 補正済み
          </p>
        </div>
        <button onClick={() => setConfirmDel(true)} className="text-court-danger text-sm">削除</button>
      </header>

      {/* 2 画面 */}
      <div className={layoutMode === 'SIDE_BY_SIDE' ? 'grid grid-cols-2 gap-1.5' : 'space-y-1.5'}>
        <VideoTile ref={backRef} label="後方（俯瞰）" present={!!rec.back} />
        <VideoTile ref={sideRef} label="サイド（フォーム）" present={!!rec.side} />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400 font-mono">
          {posSec.toFixed(2)}s / {durSec.toFixed(2)}s
        </div>
        <button
          onClick={() => setLayoutMode(m => m === 'SIDE_BY_SIDE' ? 'STACKED' : 'SIDE_BY_SIDE')}
          className="text-xs bg-court-card px-2 py-1 rounded text-court-info">
          {layoutMode === 'SIDE_BY_SIDE' ? '⬍ 縦並び' : '⬌ 横並び'}
        </button>
      </div>

      {/* 共通シークバー */}
      {timeline && (
        <input
          type="range"
          min={timeline.start} max={timeline.end} step={10}
          value={globalT}
          onChange={e => onScrub(Number(e.target.value))}
          className="w-full accent-court-accent"
        />
      )}

      {/* トランスポート */}
      <div className="flex items-center justify-center gap-3">
        <TButton onClick={() => nudge(-1000 / 30)} label="◀ コマ" />
        <button onClick={togglePlay}
          className="w-16 h-16 rounded-full bg-court-accent text-white text-2xl font-bold active:scale-95 transition">
          {playing ? '⏸' : '▶'}
        </button>
        <TButton onClick={() => nudge(1000 / 30)} label="コマ ▶" />
      </div>

      {/* スロー再生 */}
      <div className="bg-court-card rounded-xl p-3">
        <div className="text-xs text-gray-400 mb-2">再生速度（スロー解析）</div>
        <div className="grid grid-cols-4 gap-2">
          {[0.25, 0.5, 1, 2].map(s => (
            <button key={s} onClick={() => changeSpeed(s)}
              className={`py-2 rounded text-sm font-bold ${
                speed === s ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'
              }`}>
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
        💡 後方カメラで「配球（結果）」を、サイドカメラで「打点・フォーム（原因）」を
        同じ瞬間で見比べられます。スローにして打点の前後を観察しましょう。
      </div>

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConfirmDel(false)}>
          <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">同期撮影を削除</h3>
            <p className="text-sm text-gray-300">この 2 視点データを削除しますか？元に戻せません。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(false)} className="px-3 py-1.5 text-sm text-gray-300">キャンセル</button>
              <button onClick={async () => { await deleteSyncSession(rec.id); nav('/sync', { replace: true }) }}
                className="px-3 py-1.5 text-sm bg-red-700 text-white rounded">削除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const VideoTile = forwardRef<HTMLVideoElement, { label: string; present: boolean }>(
  ({ label, present }, ref) => (
    <div className="relative bg-black rounded-lg overflow-hidden aspect-[3/4]">
      <video ref={ref} playsInline muted className="absolute inset-0 w-full h-full object-contain" />
      <div className="absolute top-1 left-1 bg-black/60 rounded px-1.5 py-0.5 text-[10px] font-bold text-court-accent">
        {label}
      </div>
      {!present && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
          この視点の映像なし
        </div>
      )}
    </div>
  ),
)

function TButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="bg-court-card px-3 py-2 rounded-lg text-xs text-gray-300 active:scale-95 transition">
      {label}
    </button>
  )
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-md mx-auto p-8 text-center text-gray-400">{children}</div>
}

/** currentTime を [0, duration] にクランプ。 */
function clampCT(ct: number, durationSec: number): number {
  if (ct < 0) return 0
  if (ct > durationSec) return durationSec
  return ct
}
