import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSyncSession, deleteSyncSession, saveSyncSession } from '../lib/db'
import type {
  SyncSessionRecord, SyncClip, SyncMarker, MarkerKind,
} from '../types/sync'

const MARKER_META: Record<MarkerKind, { label: string; emoji: string; color: string; bg: string }> = {
  HIT:    { label: '打点',     emoji: '🎾', color: '#42A5F5', bg: 'bg-blue-700' },
  BOUNCE: { label: 'バウンド', emoji: '📍', color: '#26C6DA', bg: 'bg-cyan-700' },
  SERVE:  { label: 'サーブ',   emoji: '⚡', color: '#FFCA28', bg: 'bg-yellow-700' },
  ACE:    { label: 'エース',   emoji: '🌟', color: '#66BB6A', bg: 'bg-green-700' },
  MISS:   { label: 'ミス',     emoji: '❌', color: '#EF5350', bg: 'bg-red-700' },
  NOTE:   { label: 'メモ',     emoji: '✏️', color: '#AB47BC', bg: 'bg-purple-700' },
}

const MARKER_ORDER: MarkerKind[] = ['HIT', 'BOUNCE', 'SERVE', 'ACE', 'MISS', 'NOTE']

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

  // ── 打点↔弾道リンクのマーカー ──
  const [markers, setMarkers] = useState<SyncMarker[]>([])
  const [editingMarker, setEditingMarker] = useState<SyncMarker | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)

  useEffect(() => {
    if (!id) return
    getSyncSession(id).then(r => {
      setRec(r ?? null)
      setMarkers((r?.markers ?? []).slice().sort((a, b) => a.epoch - b.epoch))
      setLoading(false)
    })
  }, [id])

  // ── マーカー永続化（変更があったら保存） ──
  const persistMarkers = async (ms: SyncMarker[]) => {
    if (!rec) return
    const next: SyncSessionRecord = { ...rec, markers: ms }
    setRec(next)
    await saveSyncSession(next)
  }

  const addMarkerAt = (kind: MarkerKind, epoch: number, note?: string) => {
    const m: SyncMarker = { id: randomId(), epoch, kind, note }
    const next = [...markers, m].sort((a, b) => a.epoch - b.epoch)
    setMarkers(next)
    persistMarkers(next)
    setShowAddMenu(false)
  }

  const updateMarker = (m: SyncMarker) => {
    const next = markers.map(x => x.id === m.id ? m : x).sort((a, b) => a.epoch - b.epoch)
    setMarkers(next)
    persistMarkers(next)
  }

  const removeMarker = (id: string) => {
    const next = markers.filter(m => m.id !== id)
    setMarkers(next)
    persistMarkers(next)
  }

  const jumpToMarker = (m: SyncMarker) => {
    pause()
    setGlobalT(m.epoch)
    seekTo(m.epoch)
  }

  const stepMarker = (dir: 1 | -1) => {
    if (markers.length === 0) return
    if (dir === 1) {
      const next = markers.find(m => m.epoch > globalT + 5)
      if (next) jumpToMarker(next)
    } else {
      const prev = [...markers].reverse().find(m => m.epoch < globalT - 5)
      if (prev) jumpToMarker(prev)
    }
  }

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

      {/* 共通シークバー＋マーカードット */}
      {timeline && (
        <div className="relative pt-1">
          <input
            type="range"
            min={timeline.start} max={timeline.end} step={10}
            value={globalT}
            onChange={e => onScrub(Number(e.target.value))}
            className="w-full accent-court-accent relative z-10"
          />
          {/* マーカー dots（シークバー上に重ねる） */}
          <div className="absolute left-0 right-0 top-2 h-3 pointer-events-none">
            {markers.map(m => {
              const ratio = (m.epoch - timeline.start) / timeline.durationMs
              if (ratio < 0 || ratio > 1) return null
              const meta = MARKER_META[m.kind]
              return (
                <button
                  key={m.id}
                  onClick={() => jumpToMarker(m)}
                  title={meta.label + (m.note ? '：' + m.note : '')}
                  className="absolute -translate-x-1/2 w-3 h-3 rounded-full ring-2 ring-court-surface pointer-events-auto"
                  style={{ left: `${ratio * 100}%`, background: meta.color }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* トランスポート＋マーカーナビ */}
      <div className="flex items-center justify-center gap-2">
        <TButton onClick={() => stepMarker(-1)} label="◁ マーカー" />
        <TButton onClick={() => nudge(-1000 / 30)} label="◀ コマ" />
        <button onClick={togglePlay}
          className="w-14 h-14 rounded-full bg-court-accent text-white text-2xl font-bold active:scale-95 transition">
          {playing ? '⏸' : '▶'}
        </button>
        <TButton onClick={() => nudge(1000 / 30)} label="コマ ▶" />
        <TButton onClick={() => stepMarker(1)} label="マーカー ▷" />
      </div>

      {/* マーカー追加 */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">この瞬間にマーカーを打つ（両画面共通）</div>
          <button onClick={() => setShowAddMenu(s => !s)}
            className="text-xs bg-court-info text-white px-2 py-1 rounded">
            {showAddMenu ? '✕ 閉じる' : '＋ 追加'}
          </button>
        </div>
        {showAddMenu && (
          <div className="grid grid-cols-3 gap-2">
            {MARKER_ORDER.map(k => {
              const meta = MARKER_META[k]
              return (
                <button key={k} onClick={() => addMarkerAt(k, globalT)}
                  className={`${meta.bg} text-white text-xs font-bold py-2 rounded-lg active:scale-95 transition flex flex-col items-center`}>
                  <span className="text-lg">{meta.emoji}</span>
                  <span>{meta.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* マーカーリスト（因果リンク：タップで両画面ジャンプ） */}
      {markers.length > 0 && (
        <div className="bg-court-card rounded-xl p-3 space-y-2">
          <div className="text-xs text-gray-400">マーカー一覧（タップで両画面が同じ瞬間にジャンプ）</div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {markers.map(m => {
              const meta = MARKER_META[m.kind]
              const sec = timeline ? (m.epoch - timeline.start) / 1000 : 0
              const isCurrent = Math.abs(m.epoch - globalT) < 80
              return (
                <div key={m.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isCurrent ? 'bg-court-surface ring-1 ring-court-accent' : 'bg-court-surface/60'}`}>
                  <button onClick={() => jumpToMarker(m)}
                    className="flex-1 flex items-center gap-2 text-left">
                    <span className="text-lg">{meta.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">
                        {meta.label}{m.note && <span className="text-gray-300 font-normal"> ・ {m.note}</span>}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">{sec.toFixed(2)}s</div>
                    </div>
                  </button>
                  <button onClick={() => setEditingMarker(m)} className="text-xs text-court-info px-2">編集</button>
                  <button onClick={() => removeMarker(m.id)} className="text-xs text-court-danger px-2">✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

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

      {rec.back && rec.side && (
        <button onClick={() => nav(`/sync/${rec.id}/3d`)}
          className="w-full bg-gradient-to-br from-indigo-800 to-blue-700 text-white font-bold py-3 rounded-xl active:scale-95 transition flex items-center justify-center gap-2">
          <span className="text-xl">🛰</span>
          <span>3D 弾道変換（2 視点三角測量）</span>
          <span className="text-gray-300 text-xs">{rec.ballTags?.length ?? 0} タグ済み</span>
        </button>
      )}

      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
        💡 後方カメラで「配球（結果）」を、サイドカメラで「打点・フォーム（原因）」を
        同じ瞬間で見比べられます。スローにして打点の前後を観察しましょう。
      </div>

      {editingMarker && (
        <MarkerEditor
          marker={editingMarker}
          onClose={() => setEditingMarker(null)}
          onSave={(m) => { updateMarker(m); setEditingMarker(null) }}
        />
      )}

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

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function MarkerEditor({ marker, onClose, onSave }: {
  marker: SyncMarker; onClose: () => void; onSave: (m: SyncMarker) => void;
}) {
  const [kind, setKind] = useState<MarkerKind>(marker.kind)
  const [note, setNote] = useState(marker.note ?? '')
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">マーカーを編集</h3>
        <div>
          <div className="text-xs text-gray-400 mb-1">種別</div>
          <div className="grid grid-cols-3 gap-2">
            {MARKER_ORDER.map(k => {
              const meta = MARKER_META[k]
              return (
                <button key={k} onClick={() => setKind(k)}
                  className={`py-2 rounded text-xs font-bold flex flex-col items-center ${
                    kind === k ? meta.bg + ' text-white ring-2 ring-court-accent' : 'bg-court-card text-gray-300'
                  }`}>
                  <span className="text-lg">{meta.emoji}</span>
                  <span>{meta.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-1">メモ（任意）</div>
          <input
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="例：トスが前すぎてネットミス"
            className="w-full bg-court-card rounded p-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-300">キャンセル</button>
          <button onClick={() => onSave({ ...marker, kind, note: note.trim() || undefined })}
            className="px-3 py-1.5 text-sm bg-court-accent text-white rounded">保存</button>
        </div>
      </div>
    </div>
  )
}
