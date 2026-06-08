import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllSyncSessions, deleteSyncSession } from '../lib/db'
import type { SyncSessionRecord } from '../types/sync'

export function SyncListPage() {
  const nav = useNavigate()
  const [sessions, setSessions] = useState<SyncSessionRecord[]>([])
  const [confirmDel, setConfirmDel] = useState<SyncSessionRecord | null>(null)

  const reload = () => getAllSyncSessions().then(setSessions)
  useEffect(() => { reload() }, [])

  return (
    <div className="max-w-md mx-auto p-4 space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="font-bold">マルチアングル同期撮影</h1>
          <p className="text-xs text-gray-400">2 台連動・後方＋サイドのツイン再生</p>
        </div>
      </header>

      <button onClick={() => nav('/sync/new')}
        className="w-full bg-gradient-to-br from-emerald-800 to-emerald-600 text-white font-bold py-4 rounded-xl active:scale-95 transition flex items-center justify-center gap-2">
        <span className="text-2xl">📡📲</span> 新しい同期撮影を始める
      </button>

      <div className="bg-blue-950/60 border border-court-info/30 rounded-xl p-3 text-xs text-white/90 leading-relaxed">
        💡 2 台のスマホを連動させ、<b>後方（全体俯瞰）</b>と<b>サイド（打点・フォーム）</b>を
        1 コマのズレなく同時録画します。撮影後はどちらの端末にも 2 視点データが保存され、
        ツインスライダーで配球とフォームを見比べられます。
      </div>

      {sessions.length === 0 ? (
        <div className="text-center text-gray-500 text-sm py-8">
          まだ同期撮影がありません。<br />上のボタンから始めましょう。
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <Row key={s.id} rec={s}
              onOpen={() => nav(`/sync/${s.id}`)}
              onDelete={() => setConfirmDel(s)} />
          ))}
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConfirmDel(null)}>
          <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">同期撮影を削除</h3>
            <p className="text-sm text-gray-300">{confirmDel.title} を削除しますか？元に戻せません。</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} className="px-3 py-1.5 text-sm text-gray-300">キャンセル</button>
              <button onClick={async () => { await deleteSyncSession(confirmDel.id); setConfirmDel(null); reload() }}
                className="px-3 py-1.5 text-sm bg-red-700 text-white rounded">削除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ rec, onOpen, onDelete }: {
  rec: SyncSessionRecord; onOpen: () => void; onDelete: () => void;
}) {
  const date = new Date(rec.createdAt)
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  const views = [rec.back && '後方', rec.side && 'サイド'].filter(Boolean).join('＋')
  return (
    <div className="w-full bg-court-card rounded-lg p-3 flex items-center gap-3">
      <button onClick={onOpen} className="flex-1 flex items-center gap-3 text-left active:scale-[0.98] transition">
        <span className="text-2xl">🎥</span>
        <div className="flex-1">
          <div className="text-sm font-bold">{rec.title}</div>
          <div className="text-xs text-gray-400">
            {dateStr} ・ {views || '映像なし'}
            {rec.syncRttMs != null && ` ・ 同期 ${Math.round(rec.syncRttMs)}ms`}
            {rec.markers && rec.markers.length > 0 && ` ・ 🏷 ${rec.markers.length}`}
          </div>
        </div>
      </button>
      <button onClick={onDelete} className="text-court-danger text-xs px-2">削除</button>
    </div>
  )
}
