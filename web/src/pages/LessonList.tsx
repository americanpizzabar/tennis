import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllLessonReports, deleteLessonReport } from '../lib/db'
import type { LessonReport } from '../types/lesson'
import { SHOT_EMOJI, SHOT_LABEL } from '../data/idealForms'

export function LessonListPage() {
  const nav = useNavigate()
  const [lessons, setLessons] = useState<LessonReport[]>([])
  const [confirmDel, setConfirmDel] = useState<LessonReport | null>(null)

  const reload = () => getAllLessonReports().then(setLessons)
  useEffect(() => { reload() }, [])

  return (
    <div className="max-w-md mx-auto p-3 space-y-3 pb-24">
      <header className="flex items-center gap-3">
        <button onClick={() => nav(-1)} className="text-2xl text-gray-300">←</button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">個人レッスン</h1>
          <p className="text-xs text-gray-400">AI 骨格診断でフォームを分析</p>
        </div>
      </header>

      <button onClick={() => nav('/lesson/new')}
        className="w-full bg-green-700 hover:bg-green-600 text-white font-bold py-3 rounded-xl active:scale-95 transition">
        ⏺ 新しいレッスンを開始
      </button>

      {lessons.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl">🎾</div>
          <div className="text-gray-400 mt-2">まだレッスン記録がありません</div>
          <div className="text-xs text-gray-500 mt-1">上のボタンから始めましょう</div>
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map(l => (
            <LessonRow key={l.lessonId} lesson={l}
              onOpen={() => nav(`/lesson/${l.lessonId}`)}
              onLongPress={() => setConfirmDel(l)}
            />
          ))}
        </div>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setConfirmDel(null)}>
          <div className="bg-court-surface rounded-xl p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">レッスン記録を削除</h3>
            <p className="text-sm text-gray-300">
              {SHOT_LABEL[confirmDel.shot]} の診断結果を削除しますか？元に戻せません。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmDel(null)} className="px-3 py-1.5 text-sm text-gray-300">
                キャンセル
              </button>
              <button onClick={async () => {
                await deleteLessonReport(confirmDel.lessonId)
                setConfirmDel(null)
                reload()
              }} className="px-3 py-1.5 text-sm bg-red-700 text-white rounded">
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LessonRow({ lesson, onOpen, onLongPress }: {
  lesson: LessonReport; onOpen: () => void; onLongPress: () => void;
}) {
  let timer: number | undefined
  const startPress = () => { timer = window.setTimeout(onLongPress, 700) }
  const cancelPress = () => { if (timer) clearTimeout(timer) }
  const date = new Date(lesson.createdAt)
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  const color = lesson.overallScore >= 80 ? 'text-court-accent'
    : lesson.overallScore >= 60 ? 'text-court-warning' : 'text-court-danger'
  return (
    <button
      onClick={onOpen}
      onTouchStart={startPress} onTouchEnd={cancelPress}
      onMouseDown={startPress} onMouseUp={cancelPress} onMouseLeave={cancelPress}
      onContextMenu={e => { e.preventDefault(); onLongPress() }}
      className="w-full bg-court-card rounded-xl p-3 flex items-center gap-3 active:scale-[0.98] transition text-left"
    >
      <span className="text-3xl">{SHOT_EMOJI[lesson.shot]}</span>
      <div className="flex-1">
        <div className="font-bold text-sm">{SHOT_LABEL[lesson.shot]}</div>
        <div className="text-xs text-gray-400">
          {dateStr} ・ {lesson.swingCount}スイング ・ {lesson.durationSeconds}秒
        </div>
      </div>
      <div className="text-center">
        <div className={`${color} text-2xl font-black leading-none`}>{lesson.overallScore}</div>
        <div className="text-xs text-gray-500">点</div>
      </div>
    </button>
  )
}
