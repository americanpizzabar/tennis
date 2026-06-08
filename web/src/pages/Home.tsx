import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllMatchReports, deleteMatchReport, getAllSyncSessions, getAllLessonReports } from '../lib/db'
import type { MatchReport, MatchType } from '../types/match'
import type { SyncSessionRecord } from '../types/sync'
import type { LessonReport } from '../types/lesson'
import { useMatchStore } from '../store/matchStore'

export function HomePage() {
  const nav = useNavigate()
  const startMatch = useMatchStore(s => s.startMatch)
  const [reports, setReports] = useState<MatchReport[]>([])
  const [syncSessions, setSyncSessions] = useState<SyncSessionRecord[]>([])
  const [lessons, setLessons] = useState<LessonReport[]>([])
  const [confirmDel, setConfirmDel] = useState<MatchReport | null>(null)

  const reload = () => {
    getAllMatchReports().then(setReports)
    getAllSyncSessions().then(setSyncSessions)
    getAllLessonReports().then(setLessons)
  }
  useEffect(() => { reload() }, [])

  const handleStart = (mt: MatchType) => {
    startMatch(mt)
    nav('/match-setup')
  }

  const lastSync = syncSessions[0]
  const lastLesson = lessons[0]

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 pb-24">
      <header className="text-center pt-2">
        <h1 className="text-2xl font-black text-court-accent">🎾 Tennis AI Coach</h1>
        <p className="text-xs text-gray-400 mt-1">Web 版 — オフライン動作・データは端末内に保存</p>
      </header>

      {/* 続きから（最近のセッションへのショートカット） */}
      {(lastSync || lastLesson) && (
        <div className="space-y-2">
          {lastSync && (
            <ContinueRow
              emoji="📡"
              title="続き：直前の同期撮影"
              subtitle={lastSync.title}
              onClick={() => nav(`/sync/${lastSync.id}`)}
            />
          )}
          {lastLesson && (
            <ContinueRow
              emoji="🤖"
              title="続き：直前のレッスン"
              subtitle={shotLabel(lastLesson.shot) + ' ・ ' + new Date(lastLesson.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              onClick={() => nav(`/lesson/${lastLesson.lessonId}`)}
            />
          )}
        </div>
      )}

      {/* ── ① 試合 ── */}
      <Section title="① 試合" subtitle="スコア／スタッツ／戦術ヒント">
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
      </Section>

      {/* ── ② 練習・診断 ── */}
      <Section title="② 練習・フォーム診断" subtitle="個人の上達のための骨格 AI">
        <ActionRow
          title="個人レッスン（AI 骨格診断）"
          subtitle="カメラの前でスイング → 関節角度・運動連鎖を分析"
          emoji="🤖"
          onClick={() => nav('/lessons')}
        />
        <ActionRow
          title="マルチアングル同期撮影（2 台連動）"
          subtitle="後方＋サイドを同時録画 → 因果分析・3D 弾道・プロ仕様アナリティクス"
          emoji="📡"
          badge="PRO"
          onClick={() => nav('/sync')}
        />
      </Section>

      {/* ── ③ 戦術・戦略 ── */}
      <Section title="③ 戦術・戦略" subtitle="3D ボードと AI 必勝プラン">
        <ActionRow
          title="タクティクス・コア"
          subtitle="自分と相手のスタイル分析 → 必勝プラン自動生成"
          emoji="🎯"
          onClick={() => nav('/scouting')}
        />
        <ActionRow
          title="3D 戦術ボード"
          subtitle="視野コーン・ターゲットゲート・タップでダイブ"
          emoji="🛸"
          onClick={() => nav('/board')}
        />
        <ActionRow
          title="戦術アドバイザー"
          subtitle="状況を選ぶだけでプロの戦術を提案（オフライン）"
          emoji="💡"
          onClick={() => nav('/advisor')}
        />
        <ActionRow
          title="動画→3D 変換"
          subtitle="試合動画の 4 隅をタップ → 実距離 3D 空間に逆算"
          emoji="🎬"
          onClick={() => nav('/video-to-3d')}
        />
      </Section>

      {/* ── 最近の試合 ── */}
      {reports.length > 0 && (
        <Section title="最近の試合" subtitle={`${reports.length} 件`}>
          {reports.slice(0, 5).map(r => (
            <ReportRow
              key={r.matchId}
              report={r}
              onOpen={() => nav(`/report/${r.matchId}`)}
              onLongPress={() => setConfirmDel(r)}
            />
          ))}
        </Section>
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

function Section({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-bold">{title}</h2>
        {subtitle && <span className="text-[10px] text-gray-500">{subtitle}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function ContinueRow({ emoji, title, subtitle, onClick }: {
  emoji: string; title: string; subtitle: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full bg-gradient-to-r from-emerald-900 to-emerald-700 rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.98] transition">
      <span className="text-2xl">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm">{title}</div>
        <div className="text-xs text-gray-200/80 truncate">{subtitle}</div>
      </div>
      <span className="text-white/70">›</span>
    </button>
  )
}

function ActionRow({ title, subtitle, emoji, badge, onClick }: {
  title: string; subtitle: string; emoji: string; badge?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-court-card rounded-xl p-3 flex items-center gap-3 text-left active:scale-[0.98] transition"
    >
      <span className="text-2xl">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold">{title}</span>
          {badge && (
            <span className="text-[9px] font-bold bg-gradient-to-r from-purple-700 to-rose-600 text-white px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-400 truncate">{subtitle}</div>
      </div>
      <span className="text-gray-500">›</span>
    </button>
  )
}

function shotLabel(s: string): string {
  const map: Record<string, string> = {
    FOREHAND: 'フォアハンド', BACKHAND_ONE_HANDED: '片手バック',
    BACKHAND_TWO_HANDED: '両手バック', SERVE: 'サーブ',
    VOLLEY: 'ボレー', SLICE: 'スライス', SMASH: 'スマッシュ',
  }
  return map[s] ?? s
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
