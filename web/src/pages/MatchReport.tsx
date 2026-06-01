import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMatchReport } from '../lib/db'
import { CourtMap } from '../components/CourtMap'
import { pct } from '../types/match'
import type { MatchReport, PlayerStats } from '../types/match'

export function MatchReportPage() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [report, setReport] = useState<MatchReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getMatchReport(id).then(r => {
      setReport(r ?? null)
      setLoading(false)
    })
  }, [id])

  if (loading) {
    return <div className="p-8 text-center text-gray-400">読み込み中...</div>
  }
  if (!report) {
    return (
      <div className="p-8 text-center">
        <div className="text-gray-400 mb-4">レポートが見つかりません</div>
        <button onClick={() => nav('/')} className="text-court-accent">ホームへ</button>
      </div>
    )
  }

  const p = report.playerStats
  const o = report.opponentStats

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav('/')} className="text-2xl text-gray-300">←</button>
        <h1 className="text-lg font-bold">試合レポート</h1>
      </header>

      {/* 結果ヘッダー */}
      <div className={`rounded-xl p-4 ${report.playerWon ? 'bg-green-900/40' : 'bg-red-900/40'}`}>
        <div className="text-center">
          <div className={`text-3xl font-black ${report.playerWon ? 'text-court-accent' : 'text-court-danger'}`}>
            {report.playerWon ? '🏆 勝利' : '🎾 惜敗'}
          </div>
          <div className="text-xl font-bold mt-1">{report.finalScore}</div>
          <div className="text-xs text-gray-400 mt-1">
            {report.durationMinutes}分 ・ vs {report.opponentName}
          </div>
        </div>
      </div>

      {/* AI 3行まとめ */}
      <div className="bg-blue-950/60 rounded-xl p-3">
        <div className="text-court-warning text-xs font-bold mb-2">📝 3行まとめ</div>
        {report.summary.split('\n').filter(l => l.trim()).map((l, i) => (
          <div key={i} className="text-sm text-white/90 leading-relaxed">{l.trim()}</div>
        ))}
      </div>

      {/* スタッツセクション */}
      <StatsSection title="🎾 サービス" rows={[
        ['サービスエース', `${p.aces}`, `${o.aces}`, true],
        ['ダブルフォルト', `${p.doubleFaults}`, `${o.doubleFaults}`, false],
        ['1stサーブ確率', `${pct(p.firstServeIn, p.firstServeAttempts)}% (${p.firstServeIn}/${p.firstServeAttempts})`, `${pct(o.firstServeIn, o.firstServeAttempts)}% (${o.firstServeIn}/${o.firstServeAttempts})`, true],
        ['1stサーブ獲得率', `${pct(p.firstServePointsWon, p.firstServeIn)}%`, `${pct(o.firstServePointsWon, o.firstServeIn)}%`, true],
        ['2ndサーブ獲得率', `${pct(p.secondServePointsWon, p.secondServeAttempts)}%`, `${pct(o.secondServePointsWon, o.secondServeAttempts)}%`, true],
        ['BPセーブ', `${pct(p.breakPointsSaved, p.breakPointsFaced)}% (${p.breakPointsSaved}/${p.breakPointsFaced})`, `${pct(o.breakPointsSaved, o.breakPointsFaced)}% (${o.breakPointsSaved}/${o.breakPointsFaced})`, true],
      ]} />

      <StatsSection title="🔄 リターン" rows={[
        ['1stリターン獲得率', `${pct(p.firstServeReturnPointsWon, p.firstServeReturnAttempts)}%`, `${pct(o.firstServeReturnPointsWon, o.firstServeReturnAttempts)}%`, true],
        ['2ndリターン獲得率', `${pct(p.secondServeReturnPointsWon, p.secondServeReturnAttempts)}%`, `${pct(o.secondServeReturnPointsWon, o.secondServeReturnAttempts)}%`, true],
        ['ブレーク獲得率', `${pct(p.breakPointsConverted, p.breakPointsAttempted)}% (${p.breakPointsConverted}/${p.breakPointsAttempted})`, `${pct(o.breakPointsConverted, o.breakPointsAttempted)}% (${o.breakPointsConverted}/${o.breakPointsAttempted})`, true],
      ]} />

      <StatsSection title="🏓 ストローク" rows={[
        ['ウィナー', `${p.winners}`, `${o.winners}`, true],
        ['アンフォースドエラー', `${p.unforcedErrors}`, `${o.unforcedErrors}`, false],
        ['フォーストエラー', `${p.forcedErrors}`, `${o.forcedErrors}`, false],
        ['ネットでのポイント', `${p.netApproachesWon}/${p.netApproaches}`, `${o.netApproachesWon}/${o.netApproaches}`, true],
        ['総獲得ポイント', `${p.totalPointsWon}/${p.totalPointsPlayed}`, `${o.totalPointsWon}/${o.totalPointsPlayed}`, true],
      ]} />

      <StatsSection title="📊 アドバンスト" rows={[
        ['平均ラリー長', avgRally(p), avgRally(o), true],
        ['FHウィナー', `${p.forehandWinners}`, `${o.forehandWinners}`, true],
        ['BHウィナー', `${p.backhandWinners}`, `${o.backhandWinners}`, true],
        ['FHエラー', `${p.forehandErrors}`, `${o.forehandErrors}`, false],
        ['BHエラー', `${p.backhandErrors}`, `${o.backhandErrors}`, false],
      ]} />

      <BalanceCard p={p} o={o} />

      {report.landings.length > 0 && (
        <div className="bg-court-card rounded-xl p-3">
          <div className="text-xs text-gray-400 mb-2">着弾点マップ（試合中の記録）</div>
          <CourtMap landings={report.landings} tappable={false} />
        </div>
      )}
    </div>
  )
}

function avgRally(s: PlayerStats): string {
  if (s.rallyCount === 0) return '—'
  return (s.rallyLengthSum / s.rallyCount).toFixed(1) + '球'
}

function StatsSection({ title, rows }: {
  title: string; rows: Array<[string, string, string, boolean]>;
}) {
  return (
    <div className="bg-court-card rounded-xl p-3">
      <div className="font-bold text-sm mb-2">{title}</div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        <div className="col-span-3 text-gray-400">項目</div>
        <div className="col-span-2 text-court-accent font-bold">自分</div>
        <div className="col-span-2 text-court-danger font-bold">相手</div>
      </div>
      <hr className="border-white/10 my-1" />
      {rows.map(([label, mine, theirs, _], i) => (
        <div key={i} className="grid grid-cols-7 gap-1 text-xs py-1">
          <div className="col-span-3 text-gray-300">{label}</div>
          <div className="col-span-2 text-court-accent font-bold">{mine}</div>
          <div className="col-span-2 text-court-danger font-bold">{theirs}</div>
        </div>
      ))}
    </div>
  )
}

function BalanceCard({ p, o }: { p: PlayerStats; o: PlayerStats }) {
  const pBal = p.winners - p.unforcedErrors
  const oBal = o.winners - o.unforcedErrors
  const verdict =
    pBal > oBal ? `✅ 自分の方が攻撃の質が高い（差: +${pBal - oBal}）`
    : pBal < oBal ? `⚠️ 相手の方が攻撃の質が高い（差: ${pBal - oBal}）`
    : '互角の攻撃力'
  return (
    <div className="bg-court-card rounded-xl p-3">
      <div className="font-bold text-sm mb-2">⚖️ ウィナー − UE（攻撃の質）</div>
      <div className="grid grid-cols-2 gap-2">
        <BalanceCell label="自分" balance={pBal} winners={p.winners} errors={p.unforcedErrors} color="text-court-accent" bg="bg-green-900/30" />
        <BalanceCell label="相手" balance={oBal} winners={o.winners} errors={o.unforcedErrors} color="text-court-danger" bg="bg-red-900/30" />
      </div>
      <div className="text-xs text-gray-400 mt-2">{verdict}</div>
    </div>
  )
}

function BalanceCell({ label, balance, winners, errors, color, bg }: {
  label: string; balance: number; winners: number; errors: number; color: string; bg: string;
}) {
  return (
    <div className={`${bg} rounded-lg p-2 text-center`}>
      <div className={`${color} text-xs font-bold`}>{label}</div>
      <div className={`${color} text-2xl font-black`}>
        {balance >= 0 ? '+' : ''}{balance}
      </div>
      <div className="text-xs text-gray-400">W:{winners} / UE:{errors}</div>
    </div>
  )
}
