import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllMatchReports, deleteMatchReport } from '../lib/db'
import type { MatchReport, MatchType } from '../types/match'
import { useMatchStore } from '../store/matchStore'

export function HomePage() {
  const nav = useNavigate()
  const startMatch = useMatchStore(s => s.startMatch)
  const [reports, setReports] = useState<MatchReport[]>([])
  const [confirmDel, setConfirmDel] = useState<MatchReport | null>(null)

  const reload = () => getAllMatchReports().then(setReports)
  useEffect(() => { reload() }, [])

  const handleStart = (mt: MatchType) => {
    startMatch(mt)
    nav('/match-setup')
  }

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 pb-24">
      <header className="text-center pt-2">
        <h1 className="text-2xl font-black text-court-accent">🎾 Tennis AI Coach</h1>
        <p className="text-xs text-gray-400 mt-1">Web 版 — オフライン動作・データは端末内に保存</p>
      </header>

      {/* 機能の現実を率直に */}
      <div className="bg-blue-950/60 border border-court-info/30 rounded-xl p-3 text-sm">
        <div className="text-court-info font-bold mb-1">💡 このアプリの使い方のコツ</div>
        <ul className="text-white/90 text-xs space-y-0.5 leading-relaxed">
          <li>・スコア管理＋詳細スタッツが最も実用的</li>
          <li>・着弾点はコート図を「タップ」して手動入力</li>
          <li>・戦術ヒントはオフライン・ルールベース</li>
          <li>・PWA としてホーム画面に追加可能</li>
        </ul>
      </div>

      <div>
        <h2 className="font-bold mb-2">試合を開始</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleStart('SINGLES')}
            className="aspect-square rounded-xl bg-gradient-to-br from-green-900 to-green-600 text-white font-bold flex flex-col items-center justify-center gap-2 active:scale-95 transition"
          >
            <span className="text-3xl">👤</span>
            <span>シングルス</span>
          </button>
          <button
            onClick={() => handleStart('DOUBLES')}
            className="aspect-square rounded-xl bg-gradient-to-br from-blue-900 to-blue-600 text-white font-bold flex flex-col items-center justify-center gap-2 active:scale-95 transition"
          >
            <span className="text-3xl">👥</span>
            <span>ダブルス</span>
          </button>
        </div>
      </div>

      <ActionRow
        title="3D 戦術ボード"
        subtitle="ドローン視点とプレイヤー視点で配球＆ポジションを学ぶ"
        emoji="🛸"
        onClick={() => nav('/board')}
      />

      <ActionRow
        title="個人レッスン（AI 骨格診断）"
        subtitle="カメラの前でスイング → 関節角度＋運動連鎖を分析"
        emoji="🤖"
        onClick={() => nav('/lessons')}
      />

      <ActionRow
        title="戦術アドバイザー"
        subtitle="状況を選ぶだけでプロの戦術を提案"
        emoji="💡"
        onClick={() => nav('/advisor')}
      />

      {reports.length > 0 && (
        <div>
          <h2 className="font-bold mb-2">最近の試合</h2>
          <div className="space-y-2">
            {reports.map(r => (
              <ReportRow
                key={r.matchId}
                report={r}
                onOpen={() => nav(`/report/${r.matchId}`)}
                onLongPress={() => setConfirmDel(r)}
              />
            ))}
          </div>
        </div>
      )}

      {confirmDel && (
        <Modal onClose={() => setConfirmDel(null)}>
          <h3 className="text-lg font-bold mb-2">試合記録を削除</h3>
          <p className="text-sm text-gray-300">
            {confirmDel.matchType === 'SINGLES' ? 'シングルス' : 'ダブルス'} vs {confirmDel.opponentName}
            （{confirmDel.finalScore}）の記録を削除しますか？元に戻せません。
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setConfirmDel(null)} className="px-3 py-1.5 text-sm text-gray-300">
              キャンセル
            </button>
            <button
              onClick={async () => {
                await deleteMatchReport(confirmDel.matchId)
                setConfirmDel(null)
                reload()
              }}
              className="px-3 py-1.5 text-sm bg-red-700 text-white rounded"
            >
              削除
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ActionRow({ title, subtitle, emoji, onClick }: {
  title: string; subtitle: string; emoji: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-court-card rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.98] transition"
    >
      <span className="text-2xl">{emoji}</span>
      <div className="flex-1">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-gray-400">{subtitle}</div>
      </div>
      <span className="text-gray-500">›</span>
    </button>
  )
}

function ReportRow({ report, onOpen, onLongPress }: {
  report: MatchReport; onOpen: () => void; onLongPress: () => void;
}) {
  let timer: number | undefined
  const startPress = () => {
    timer = window.setTimeout(onLongPress, 700)
  }
  const cancelPress = () => {
    if (timer) clearTimeout(timer)
  }
  const date = new Date(report.createdAt)
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  return (
    <button
      onClick={onOpen}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onContextMenu={e => { e.preventDefault(); onLongPress() }}
      className="w-full bg-court-card rounded-lg p-3 flex items-center gap-3 text-left active:scale-[0.98] transition"
    >
      <span className={`px-2 py-0.5 rounded text-xs font-bold ${report.playerWon ? 'bg-green-900 text-court-accent' : 'bg-red-900 text-court-danger'}`}>
        {report.playerWon ? '勝' : '敗'}
      </span>
      <div className="flex-1">
        <div className="text-sm font-bold">
          vs {report.opponentName} <span className="text-xs text-gray-400">{report.matchType === 'SINGLES' ? 'シングルス' : 'ダブルス'}</span>
        </div>
        <div className="text-xs text-gray-400">{dateStr} ・ {report.durationMinutes}分</div>
      </div>
      <div className="font-bold text-sm">{report.finalScore}</div>
    </button>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
