import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSyncSession, getAnnotationsForSync, saveAnnotation, deleteAnnotation } from '../lib/db'
import type { SyncSessionRecord } from '../types/sync'
import type { VoiceAnnotation, AnnotationStroke } from '../types/annotation'
import { analyzeRallies, inPlayRatio, type RallySegment } from '../lib/rallyTrim'
import {
  buildBounceHeatmap, buildDepthHistogram, depthByPlayerZone, buildServeCorrelation,
  COURT, type HeatmapCell, type BounceDepthBucket, type DepthByZoneRow,
} from '../lib/courtStats'
import {
  samplePoseAroundHit, analyzeChain, JOINT_LABEL, JOINT_ORDER,
  type ChainAnalysis,
} from '../lib/kineticChain'

/**
 * 「プロ仕様」ダッシュボード：
 *  ① ラリー自動トリミング
 *  ② ヒートマップ & 深さ統計
 *  ③ キネティックチェーン解析
 *  ④ ボイス・アノテーション一覧
 */

type Tab = 'RALLY' | 'COURT' | 'CHAIN' | 'ANNOT'

export function ProAnalyticsPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [rec, setRec] = useState<SyncSessionRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('RALLY')

  useEffect(() => {
    if (!id) return
    getSyncSession(id).then(r => { setRec(r ?? null); setLoading(false) })
  }, [id])

  if (loading) return <Center>読み込み中…</Center>
  if (!rec) return <Center>セッションが見つかりません</Center>

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold text-sm">{rec.title}</h1>
          <p className="text-xs text-gray-400">プロ仕様アナリティクス</p>
        </div>
      </header>

      <nav className="grid grid-cols-4 gap-1 bg-court-card rounded-xl p-1">
        <TabBtn cur={tab} v="RALLY" set={setTab} label="✂️ ラリー" />
        <TabBtn cur={tab} v="COURT" set={setTab} label="🔥 ヒートマップ" />
        <TabBtn cur={tab} v="CHAIN" set={setTab} label="⚙️ 連鎖" />
        <TabBtn cur={tab} v="ANNOT" set={setTab} label="🎙 解説" />
      </nav>

      {tab === 'RALLY' && <RallyTab rec={rec} />}
      {tab === 'COURT' && <CourtTab rec={rec} />}
      {tab === 'CHAIN' && <ChainTab rec={rec} />}
      {tab === 'ANNOT' && <AnnotTab rec={rec} />}
    </div>
  )
}

function TabBtn({ cur, v, set, label }: { cur: Tab; v: Tab; set: (t: Tab) => void; label: string }) {
  return (
    <button onClick={() => set(v)}
      className={`py-1.5 rounded text-[11px] font-bold ${cur === v ? 'bg-court-accent text-white' : 'text-gray-300'}`}>
      {label}
    </button>
  )
}

// ──────────────────────────────────────────────────────
// ① ラリー自動トリミング
// ──────────────────────────────────────────────────────
function RallyTab({ rec }: { rec: SyncSessionRecord }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rallies, setRallies] = useState<RallySegment[] | null>(null)
  const [source, setSource] = useState<'BACK' | 'SIDE'>('BACK')
  const [hits, setHits] = useState<number>(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const urlRef = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [curIdx, setCurIdx] = useState(0)
  const clip = source === 'BACK' ? rec.back : rec.side

  useEffect(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    if (clip && videoRef.current) {
      const url = URL.createObjectURL(clip.blob)
      urlRef.current = url
      videoRef.current.src = url
    }
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }
  }, [clip])

  const run = async () => {
    if (!clip) return
    setBusy(true); setError(null)
    try {
      const { hits, rallies } = await analyzeRallies(clip.blob)
      setHits(hits.length)
      setRallies(rallies)
    } catch (e: any) {
      setError('解析失敗：' + (e?.message ?? String(e)))
    } finally {
      setBusy(false)
    }
  }

  // ラリーだけを連続再生
  const playRally = (idx: number) => {
    if (!rallies || !videoRef.current || !clip) return
    const r = rallies[idx]
    videoRef.current.currentTime = Math.min(r.startSec, clip.durationSec)
    videoRef.current.play().catch(() => {})
    setCurIdx(idx); setPlaying(true)
  }
  // 時間監視：endSec を越えたら次のラリーへ
  useEffect(() => {
    if (!playing || !rallies || !videoRef.current) return
    const v = videoRef.current
    const tick = () => {
      const cur = rallies[curIdx]
      if (!cur) return
      if (v.currentTime >= cur.endSec) {
        const next = curIdx + 1
        if (next < rallies.length) playRally(next)
        else { v.pause(); setPlaying(false) }
      }
    }
    const tid = window.setInterval(tick, 100)
    return () => clearInterval(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, curIdx, rallies])

  const totalIn = useMemo(() => rallies ? inPlayRatio(rallies, clip?.durationSec ?? 0) : 0, [rallies, clip])

  if (!clip) return <Notice>映像がありません</Notice>

  return (
    <div className="space-y-3">
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <div className="text-xs text-gray-400">解析対象</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setSource('BACK')} disabled={!rec.back}
            className={`py-2 rounded text-sm font-bold ${source === 'BACK' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
            後方
          </button>
          <button onClick={() => setSource('SIDE')} disabled={!rec.side}
            className={`py-2 rounded text-sm font-bold ${source === 'SIDE' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
            サイド
          </button>
        </div>
        <button onClick={run} disabled={busy}
          className="w-full bg-gradient-to-br from-indigo-800 to-blue-700 disabled:bg-gray-700 text-white font-bold py-2 rounded-lg active:scale-95">
          {busy ? '🎧 音声を解析中…' : '✂️ 打球音からラリーを自動抽出'}
        </button>
        {error && <div className="text-xs text-court-danger">{error}</div>}
      </div>

      {/* 映像 + プレーヤー */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video ref={videoRef} playsInline controls className="absolute inset-0 w-full h-full object-contain" />
      </div>

      {rallies && (
        <>
          <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center text-xs">
            <Cell label="検出ショット" value={`${hits}`} />
            <Cell label="ラリー数" value={`${rallies.length}`} />
            <Cell label="オンプレイ率" value={`${totalIn.toFixed(0)}%`} />
          </div>

          {rallies.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-gray-400">ラリー一覧（タップで連続再生開始）</div>
              {rallies.map((r, i) => (
                <button key={i} onClick={() => playRally(i)}
                  className={`w-full text-left bg-court-card rounded-lg p-2 flex items-center gap-2 ${curIdx === i && playing ? 'ring-2 ring-court-accent' : ''}`}>
                  <span className="text-court-accent text-sm font-bold w-7">#{i + 1}</span>
                  <div className="flex-1">
                    <div className="text-xs">
                      {r.startSec.toFixed(1)}s 〜 {r.endSec.toFixed(1)}s（{(r.endSec - r.startSec).toFixed(1)}s）
                    </div>
                    <div className="text-[10px] text-gray-400">
                      ショット {r.shots} 本 ・ 強度ピーク {(r.peakStrength * 100).toFixed(0)}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
            💡 打球音（ガット衝撃の過渡音）を高域 RMS と適応スレッショルドで検出しています。
            連続するインパクトを 1 つのラリーとしてまとめ、前後に余白を付けてシームレス再生します。
          </div>
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────
// ② ヒートマップ & 深さ統計
// ──────────────────────────────────────────────────────
function CourtTab({ rec }: { rec: SyncSessionRecord }) {
  const heat = useMemo(() => buildBounceHeatmap(rec, 0.6), [rec])
  const depth = useMemo(() => buildDepthHistogram(rec), [rec])
  const byZone = useMemo(() => depthByPlayerZone(rec), [rec])
  const serve = useMemo(() => buildServeCorrelation(rec), [rec])
  const hasData = (rec.ballTags?.length ?? 0) > 0
  if (!hasData) {
    return <Notice>3D 弾道タグがありません。先に 🛰 3D 弾道変換でタグ付けしてください。</Notice>
  }
  return (
    <div className="space-y-3">
      {/* 着弾ヒートマップ */}
      <div className="bg-court-card rounded-xl p-3">
        <div className="text-xs text-gray-400 mb-2">🔥 着弾ヒートマップ</div>
        <CourtHeatmap heat={heat} />
        <div className="text-[10px] text-gray-500 mt-1">
          青：少ない ／ 赤：集中。BOUNCE マーカーのみを集計。
        </div>
      </div>

      {/* 深さヒストグラム */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <div className="text-xs text-gray-400">📏 ショットの深さ分布（相手側）</div>
        <DepthBars buckets={depth} />
      </div>

      {/* ポジション × 深さの因果 */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <div className="text-xs text-gray-400">📐 自分のポジションが「浅さ」に与える影響</div>
        <table className="w-full text-xs">
          <thead className="text-gray-500">
            <tr><th className="text-left">ゾーン</th><th>本数</th><th>浅さ率</th><th>平均深さ</th></tr>
          </thead>
          <tbody>
            {byZone.map(r => (
              <tr key={r.zone} className="border-t border-court-surface">
                <td className="py-1">{r.zone}</td>
                <td className="text-center">{r.total}</td>
                <td className={`text-center font-bold ${r.shallowRate > 0.4 ? 'text-court-danger' : 'text-court-accent'}`}>
                  {(r.shallowRate * 100).toFixed(0)}%
                </td>
                <td className="text-center">{r.avgDepthM.toFixed(1)} m</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[10px] text-gray-500">
          ベースライン裏で打球→浅さ率が上がるなら「下がっている時に浅くなる癖」のサイン。
        </div>
      </div>

      {/* サーブ コース × トス相関 */}
      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <div className="text-xs text-gray-400">⚡ サーブのコース傾向</div>
        <ServeCorrelTable correl={serve} />
      </div>
    </div>
  )
}

function CourtHeatmap({ heat }: { heat: HeatmapCell[] }) {
  // ダブルスコート全体を viewBox に
  const W = COURT.DOUBLES_HALF_W * 2
  const L = COURT.HALF_LEN * 2
  // viewBox: x=[-w, w], y=[-l, l] → SVG では y を反転
  return (
    <svg viewBox={`${-COURT.DOUBLES_HALF_W} ${-COURT.HALF_LEN} ${W} ${L}`}
      className="w-full" preserveAspectRatio="xMidYMid meet"
      style={{ aspectRatio: `${W / L}`, background: '#1A472A' }}>
      {/* ライン */}
      <rect x={-COURT.DOUBLES_HALF_W} y={-COURT.HALF_LEN} width={W} height={L}
        fill="none" stroke="white" strokeWidth={0.05} />
      <rect x={-COURT.SINGLES_HALF_W} y={-COURT.HALF_LEN} width={COURT.SINGLES_HALF_W * 2} height={L}
        fill="none" stroke="white" strokeWidth={0.04} />
      <line x1={-COURT.DOUBLES_HALF_W} y1={0} x2={COURT.DOUBLES_HALF_W} y2={0} stroke="white" strokeWidth={0.08} />
      <line x1={-COURT.SINGLES_HALF_W} y1={-COURT.SERVICE_LEN} x2={COURT.SINGLES_HALF_W} y2={-COURT.SERVICE_LEN}
        stroke="white" strokeWidth={0.04} />
      <line x1={-COURT.SINGLES_HALF_W} y1={COURT.SERVICE_LEN} x2={COURT.SINGLES_HALF_W} y2={COURT.SERVICE_LEN}
        stroke="white" strokeWidth={0.04} />
      <line x1={0} y1={-COURT.SERVICE_LEN} x2={0} y2={COURT.SERVICE_LEN} stroke="white" strokeWidth={0.04} />
      {/* ヒートマップ：ガウシアン円で重畳 */}
      {heat.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.z} r={0.8}
          fill={heatColor(c.density)} opacity={0.35 + c.density * 0.5} />
      ))}
    </svg>
  )
}
function heatColor(t: number): string {
  // 青 → 緑 → 黄 → 赤
  const r = Math.round(Math.min(255, 80 + 175 * Math.max(0, t * 1.5 - 0.5)))
  const g = Math.round(Math.min(255, 80 + 175 * Math.max(0, 1 - Math.abs(t * 2 - 1))))
  const b = Math.round(Math.min(255, 200 * Math.max(0, 1 - t * 1.5)))
  return `rgb(${r},${g},${b})`
}

function DepthBars({ buckets }: { buckets: BounceDepthBucket[] }) {
  const maxC = Math.max(1, ...buckets.map(b => b.count))
  return (
    <div className="space-y-1">
      {buckets.map((b, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-16 text-gray-400">
            {i === buckets.length - 1 ? '深' : i === 0 ? '浅' : ''} {(b.ratio * 100).toFixed(0)}%
          </span>
          <div className="flex-1 h-4 bg-court-surface rounded overflow-hidden">
            <div className="h-full bg-court-accent" style={{ width: `${(b.count / maxC) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-gray-300">{b.count}</span>
        </div>
      ))}
    </div>
  )
}

function ServeCorrelTable({ correl }: { correl: ReturnType<typeof buildServeCorrelation> }) {
  const rows = [
    { side: 'DEUCE' as const, label: 'デュース側' },
    { side: 'AD' as const, label: 'アド側' },
  ]
  return (
    <table className="w-full text-xs">
      <thead className="text-gray-500">
        <tr><th className="text-left">サーバー位置</th><th>本数</th><th>ワイド</th><th>ボディ</th><th>T</th></tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const s = correl.byCourt[r.side]
          if (s.total === 0) return (
            <tr key={r.side} className="border-t border-court-surface text-gray-500">
              <td className="py-1">{r.label}</td><td colSpan={4} className="text-center">データなし</td>
            </tr>
          )
          return (
            <tr key={r.side} className="border-t border-court-surface">
              <td className="py-1">{r.label}</td>
              <td className="text-center">{s.total}</td>
              <td className="text-center">{((s.wide / s.total) * 100).toFixed(0)}%</td>
              <td className="text-center">{((s.body / s.total) * 100).toFixed(0)}%</td>
              <td className="text-center">{((s.t / s.total) * 100).toFixed(0)}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ──────────────────────────────────────────────────────
// ③ キネティックチェーン
// ──────────────────────────────────────────────────────
function ChainTab({ rec }: { rec: SyncSessionRecord }) {
  const hitMarkers = useMemo(() =>
    (rec.markers ?? []).filter(m => m.kind === 'HIT' || m.kind === 'SERVE')
      .slice().sort((a, b) => a.epoch - b.epoch)
  , [rec.markers])
  const [idx, setIdx] = useState(0)
  const [analysis, setAnalysis] = useState<ChainAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const urlRef = useRef<string | null>(null)
  const m = hitMarkers[idx]

  useEffect(() => {
    if (!rec.side) return
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(rec.side.blob)
    urlRef.current = url
    if (videoRef.current) videoRef.current.src = url
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }
  }, [rec.side])

  const run = async () => {
    if (!m || !rec.side || !videoRef.current) return
    setBusy(true); setError(null); setAnalysis(null)
    try {
      const hitSec = (m.epoch - rec.side.startEpoch) / 1000
      videoRef.current.currentTime = Math.max(0, hitSec - 0.5)
      const samples = await samplePoseAroundHit(videoRef.current, hitSec)
      setAnalysis(analyzeChain(samples))
    } catch (e: any) {
      setError('解析失敗：' + (e?.message ?? String(e)))
    } finally {
      setBusy(false)
    }
  }

  if (!rec.side) return <Notice>サイドカメラの映像がありません</Notice>
  if (hitMarkers.length === 0) return <Notice>HIT/SERVE マーカーがありません</Notice>

  return (
    <div className="space-y-3">
      <div className="bg-court-card rounded-xl p-3 flex items-center justify-between">
        <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}
          className="text-sm text-court-info disabled:text-gray-600">◁ 前</button>
        <div className="text-center text-xs">
          <div className="text-gray-400">ショット {idx + 1} / {hitMarkers.length}</div>
          <div className="text-sm font-bold">
            {m.kind === 'SERVE' ? '⚡ サーブ' : '🎾 打点'}{m.note && ` ・ ${m.note}`}
          </div>
        </div>
        <button onClick={() => setIdx(Math.min(hitMarkers.length - 1, idx + 1))} disabled={idx >= hitMarkers.length - 1}
          className="text-sm text-court-info disabled:text-gray-600">次 ▷</button>
      </div>

      <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
        <video ref={videoRef} playsInline muted controls className="absolute inset-0 w-full h-full object-contain" />
      </div>

      <button onClick={run} disabled={busy}
        className="w-full bg-gradient-to-br from-indigo-800 to-blue-700 disabled:bg-gray-700 text-white font-bold py-2 rounded-lg active:scale-95">
        {busy ? '🦴 骨格を時系列解析中…' : '⚙️ キネティックチェーンを解析'}
      </button>
      {error && <div className="text-xs text-court-danger">{error}</div>}

      {analysis && <ChainResult analysis={analysis} />}

      <div className="bg-blue-950/60 rounded-xl p-3 text-xs text-white/80 leading-relaxed">
        💡 ①膝 → ②腰 → ③肩 → ④肘 → ⑤手首 の順に角速度ピークが連鎖するのが理想。
        順序が崩れていれば「手打ち」のサイン。インパクト時の頭部のブレ（Head Still）も同時に評価します。
      </div>
    </div>
  )
}

function ChainResult({ analysis }: { analysis: ChainAnalysis }) {
  // ピークを時刻順に並べる
  const peaks = analysis.peaks.slice().sort((a, b) => a.relMs - b.relMs)
  const minMs = Math.min(-200, ...peaks.map(p => p.relMs))
  const maxMs = Math.max(200, ...peaks.map(p => p.relMs))
  const span = maxMs - minMs
  return (
    <div className="space-y-3">
      <div className="bg-court-card rounded-xl p-3 grid grid-cols-3 text-center text-xs">
        <Cell label="連鎖順序" value={`${(analysis.orderScore * 100).toFixed(0)}%`} />
        <Cell label="手打ち度" value={analysis.armOnlyScore.toFixed(2)} />
        <Cell label="頭の安定" value={analysis.headStillRating} />
      </div>

      <div className="bg-court-card rounded-xl p-3 space-y-2">
        <div className="text-xs text-gray-400">⏱ 角速度ピークのタイムライン（インパクトを 0 ms）</div>
        <div className="relative h-24">
          {/* 0 ms 線 */}
          <div className="absolute top-0 bottom-0 border-l-2 border-court-warning/70"
            style={{ left: `${((0 - minMs) / span) * 100}%` }} />
          {JOINT_ORDER.map((j, i) => {
            const p = peaks.find(x => x.joint === j)
            if (!p) return null
            const xPct = ((p.relMs - minMs) / span) * 100
            const top = (i / 4) * 80
            return (
              <div key={j} className="absolute" style={{ left: `${xPct}%`, top, transform: 'translate(-50%, 0)' }}>
                <div className="w-3 h-3 rounded-full bg-court-accent ring-2 ring-white" />
                <div className="text-[9px] text-court-accent font-bold mt-0.5">{JOINT_LABEL[j].slice(0, 5)}</div>
              </div>
            )
          })}
        </div>
        <div className="text-[10px] text-gray-500 flex justify-between">
          <span>{minMs} ms</span><span>0</span><span>{maxMs} ms</span>
        </div>
      </div>

      {analysis.outOfOrder.length > 0 && (
        <div className="bg-red-900/40 border border-red-700 rounded-xl p-3 text-xs">
          ⚠️ 順序が崩れています：{analysis.outOfOrder.map(j => JOINT_LABEL[j]).join(' → ')}
          <div className="mt-1 text-gray-300">運動連鎖が逆転しているとパワーが伝わらず、肩・肘に負担。</div>
        </div>
      )}

      <div className="bg-court-card rounded-xl p-3 text-xs space-y-1">
        <div className="text-gray-400">各ピーク詳細</div>
        {peaks.map(p => (
          <div key={p.joint} className="flex justify-between">
            <span>{JOINT_LABEL[p.joint]}</span>
            <span className="font-mono">{p.relMs.toFixed(0)} ms ・ {p.omega.toFixed(1)} rad/s</span>
          </div>
        ))}
      </div>
    </div>
  )
}
// ──────────────────────────────────────────────────────
// ④ ボイス・アノテーション
// ──────────────────────────────────────────────────────
function AnnotTab({ rec }: { rec: SyncSessionRecord }) {
  const [annots, setAnnots] = useState<VoiceAnnotation[]>([])
  const [recording, setRecording] = useState(false)
  const reload = () => getAnnotationsForSync(rec.id).then(setAnnots)
  useEffect(() => { reload() }, [rec.id])
  return (
    <div className="space-y-3">
      <button onClick={() => setRecording(true)}
        className="w-full bg-gradient-to-br from-purple-800 to-pink-700 text-white font-bold py-3 rounded-xl active:scale-95">
        🎙 新規の解説ビデオを作成
      </button>
      {recording && (
        <AnnotationRecorder rec={rec} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); reload() }} />
      )}
      {annots.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-6">まだ解説ビデオがありません</div>
      ) : (
        <div className="space-y-2">
          {annots.map(a => (
            <AnnotationRow key={a.id} a={a} onDelete={async () => { await deleteAnnotation(a.id); reload() }} />
          ))}
        </div>
      )}
    </div>
  )
}

function AnnotationRecorder({ rec, onClose, onSaved }: {
  rec: SyncSessionRecord; onClose: () => void; onSaved: () => void;
}) {
  const [source, setSource] = useState<'BACK' | 'SIDE'>('BACK')
  const [snapshotSec, setSnapshotSec] = useState(0)
  const [stage, setStage] = useState<'CAPTURE' | 'ANNOTATE'>('CAPTURE')
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgBlob, setImgBlob] = useState<Blob | null>(null)
  const [title, setTitle] = useState('解説 ' + new Date().toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' }))
  const videoRef = useRef<HTMLVideoElement>(null)
  const urlRef = useRef<string | null>(null)
  const clip = source === 'BACK' ? rec.back : rec.side

  useEffect(() => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    if (clip && videoRef.current) {
      const url = URL.createObjectURL(clip.blob)
      urlRef.current = url
      videoRef.current.src = url
    }
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      if (imgUrl) URL.revokeObjectURL(imgUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip])

  const capture = async () => {
    const v = videoRef.current
    if (!v) return
    setSnapshotSec(v.currentTime)
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth || 1280
    canvas.height = v.videoHeight || 720
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/jpeg', 0.85))
    if (imgUrl) URL.revokeObjectURL(imgUrl)
    setImgBlob(blob)
    setImgUrl(URL.createObjectURL(blob))
    setStage('ANNOTATE')
  }

  if (!clip) return (
    <div className="bg-court-card rounded-xl p-3 text-xs text-gray-400">
      映像がありません。<button onClick={onClose} className="text-court-info ml-2">閉じる</button>
    </div>
  )

  return (
    <div className="bg-court-card rounded-xl p-3 space-y-2">
      {stage === 'CAPTURE' && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400">解説したい瞬間で一時停止 → 「キャプチャ」</div>
            <button onClick={onClose} className="text-court-danger text-xs">✕ 閉じる</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSource('BACK')} disabled={!rec.back}
              className={`py-1.5 rounded text-xs font-bold ${source === 'BACK' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
              後方
            </button>
            <button onClick={() => setSource('SIDE')} disabled={!rec.side}
              className={`py-1.5 rounded text-xs font-bold ${source === 'SIDE' ? 'bg-court-accent text-white' : 'bg-court-surface text-gray-300'}`}>
              サイド
            </button>
          </div>
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video ref={videoRef} playsInline controls className="absolute inset-0 w-full h-full object-contain" />
          </div>
          <button onClick={capture}
            className="w-full bg-court-accent text-white font-bold py-2 rounded-lg">
            📸 この瞬間をキャプチャ
          </button>
        </>
      )}
      {stage === 'ANNOTATE' && imgBlob && imgUrl && (
        <AnnotationCanvas
          imageUrl={imgUrl} imageBlob={imgBlob}
          title={title} setTitle={setTitle}
          source={source} snapshotSec={snapshotSec}
          syncId={rec.id}
          onCancel={() => { setStage('CAPTURE') }}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

/** 画像にお絵描き＋同時に音声録音。 */
function AnnotationCanvas({
  imageUrl, imageBlob, title, setTitle, source, snapshotSec, syncId, onCancel, onSaved,
}: {
  imageUrl: string; imageBlob: Blob; title: string; setTitle: (s: string) => void;
  source: 'BACK' | 'SIDE'; snapshotSec: number; syncId: string;
  onCancel: () => void; onSaved: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [color, setColor] = useState('#FF5252')
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([])
  const [drawing, setDrawing] = useState<AnnotationStroke | null>(null)
  const [recState, setRecState] = useState<'IDLE' | 'REC' | 'DONE'>('IDLE')
  const mrRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<{ blob: Blob; mime: string } | null>(null)
  const recStartRef = useRef(0)
  const [elapsed, setElapsed] = useState(0)
  const elapsedTimerRef = useRef<number | null>(null)

  const COLORS = ['#FF5252', '#FFCA28', '#42A5F5', '#66BB6A', '#FFFFFF']

  // canvas を画像にフィット
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const c = canvasRef.current
      if (!c) return
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      redraw()
    }
    img.src = imageUrl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl])

  const redraw = () => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, c.width, c.height)
      for (const s of strokes) drawStroke(ctx, s, c.width, c.height)
      if (drawing) drawStroke(ctx, drawing, c.width, c.height)
    }
    img.src = imageUrl
  }
  // strokes / drawing が変わるたび再描画
  useEffect(() => { redraw() /* eslint-disable-next-line */ }, [strokes, drawing])

  const startStroke = (e: React.PointerEvent) => {
    const p = pickPt(e)
    setDrawing({
      tSec: recState === 'REC' ? (Date.now() - recStartRef.current) / 1000 : 0,
      color, width: 0.005, points: [p],
    })
  }
  const moveStroke = (e: React.PointerEvent) => {
    if (!drawing) return
    setDrawing({ ...drawing, points: [...drawing.points, pickPt(e)] })
  }
  const endStroke = () => {
    if (!drawing) return
    setStrokes(s => [...s, drawing])
    setDrawing(null)
  }
  const pickPt = (e: React.PointerEvent): [number, number] => {
    const rect = containerRef.current!.getBoundingClientRect()
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
  }

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = pickAudioMime()
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || mime || 'audio/webm' })
        audioRef.current = { blob, mime: mr.mimeType || mime || 'audio/webm' }
        stream.getTracks().forEach(t => t.stop())
        setRecState('DONE')
      }
      mr.start(250)
      mrRef.current = mr
      recStartRef.current = Date.now()
      setRecState('REC')
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsed((Date.now() - recStartRef.current) / 1000)
      }, 200)
    } catch (e) {
      alert('マイクへのアクセスに失敗しました')
    }
  }
  const stopRec = () => {
    const mr = mrRef.current
    if (mr && mr.state !== 'inactive') mr.stop()
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
  }

  const save = async () => {
    if (!audioRef.current) return
    const a: VoiceAnnotation = {
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      syncId, createdAt: Date.now(),
      title, source, snapshotSec,
      imageBlob, audioBlob: audioRef.current.blob, audioMime: audioRef.current.mime,
      strokes, durationSec: elapsed,
    }
    await saveAnnotation(a)
    onSaved()
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="flex-1 bg-court-surface rounded px-2 py-1 text-sm" />
        <button onClick={onCancel} className="ml-2 text-court-danger text-xs">✕ やり直し</button>
      </div>
      <div ref={containerRef}
        className="relative bg-black rounded-lg overflow-hidden touch-none"
        onPointerDown={startStroke} onPointerMove={moveStroke}
        onPointerUp={endStroke} onPointerCancel={endStroke}>
        <canvas ref={canvasRef} className="w-full block" />
      </div>
      <div className="flex items-center gap-1">
        {COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-7 h-7 rounded-full ${color === c ? 'ring-2 ring-white' : ''}`}
            style={{ background: c }} />
        ))}
        <button onClick={() => setStrokes([])}
          className="ml-auto text-xs bg-court-card text-court-danger px-2 py-1 rounded">クリア</button>
      </div>
      {recState === 'IDLE' && (
        <button onClick={startRec}
          className="w-full bg-court-danger text-white font-bold py-2 rounded-lg">
          🎙 解説を録音（描きながら話す）
        </button>
      )}
      {recState === 'REC' && (
        <button onClick={stopRec}
          className="w-full bg-red-700 text-white font-bold py-2 rounded-lg">
          ⏹ 録音停止 ({elapsed.toFixed(1)}s)
        </button>
      )}
      {recState === 'DONE' && (
        <button onClick={save}
          className="w-full bg-court-accent text-white font-bold py-2 rounded-lg">
          💾 解説ビデオを保存
        </button>
      )}
    </div>
  )
}

function drawStroke(ctx: CanvasRenderingContext2D, s: AnnotationStroke, w: number, h: number) {
  if (s.points.length < 1) return
  ctx.strokeStyle = s.color
  ctx.lineWidth = s.width * Math.min(w, h)
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.beginPath()
  for (let i = 0; i < s.points.length; i++) {
    const [px, py] = s.points[i]
    const x = px * w, y = py * h
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

function pickAudioMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const c of cands) if (MediaRecorder.isTypeSupported(c)) return c
  return ''
}

function AnnotationRow({ a, onDelete }: { a: VoiceAnnotation; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [t, setT] = useState(0)

  useEffect(() => {
    if (!open) return
    const iu = URL.createObjectURL(a.imageBlob)
    const au = URL.createObjectURL(a.audioBlob)
    setImgUrl(iu); setAudioUrl(au)
    return () => { URL.revokeObjectURL(iu); URL.revokeObjectURL(au) }
  }, [open, a])

  // 再生位置に応じて描画
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setT(audio.currentTime)
    audio.addEventListener('timeupdate', onTime)
    return () => audio.removeEventListener('timeupdate', onTime)
  }, [audioUrl])

  useEffect(() => {
    if (!imgUrl) return
    const img = new Image()
    img.onload = () => {
      const c = canvasRef.current
      if (!c) return
      c.width = img.naturalWidth; c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      for (const s of a.strokes) {
        if (s.tSec <= t) drawStroke(ctx, s, c.width, c.height)
      }
    }
    img.src = imgUrl
  }, [imgUrl, t, a.strokes])

  return (
    <div className="bg-court-card rounded-lg p-2">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="flex-1 text-left">
          <div className="text-sm font-bold">{a.title}</div>
          <div className="text-[10px] text-gray-400">
            {new Date(a.createdAt).toLocaleString('ja-JP')} ・ {a.source} ・ {a.durationSec.toFixed(0)}s
          </div>
        </button>
        <button onClick={onDelete} className="text-court-danger text-xs px-2">削除</button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="bg-black rounded">
            <canvas ref={canvasRef} className="w-full block" />
          </div>
          <audio ref={audioRef} src={audioUrl ?? undefined} controls className="w-full" />
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────
function Center({ children }: { children: React.ReactNode }) {
  return <div className="max-w-md mx-auto p-8 text-center text-gray-400">{children}</div>
}
function Notice({ children }: { children: React.ReactNode }) {
  return <div className="bg-court-card rounded-xl p-4 text-sm text-gray-300">{children}</div>
}
function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-lg font-black text-court-accent">{value}</div>
      <div className="text-[10px] text-gray-400">{label}</div>
    </div>
  )
}
