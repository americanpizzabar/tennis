import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/Home'
import { MatchSetupPage } from './pages/MatchSetup'
import { MatchPage } from './pages/Match'
import { MatchReportPage } from './pages/MatchReport'
import { TacticalAdvisorPage } from './pages/TacticalAdvisor'
import { LessonPage } from './pages/Lesson'
import { LessonListPage } from './pages/LessonList'
import { LessonDetailPage } from './pages/LessonDetail'
import { TacticalBoardPage } from './pages/TacticalBoard'
import { ScoutingDashboardPage } from './pages/ScoutingDashboard'
import { ScoutingEditorPage } from './pages/ScoutingEditor'
import { GamePlanPage } from './pages/GamePlan'

// SPA リライトに対応するホスティング（Vercel / Netlify / Cloudflare 等）では
// BrowserRouter を使うとクリーン URL になる。`file://` で開く or 任意の静的サーバで
// 動かしたい場合は HashRouter にフォールバックすると安全。
const IS_FILE_SCHEME = typeof window !== 'undefined' && window.location.protocol === 'file:'
const Router = IS_FILE_SCHEME ? HashRouter : BrowserRouter

export function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/match-setup" element={<MatchSetupPage />} />
        <Route path="/match" element={<MatchPage />} />
        <Route path="/report/:id" element={<MatchReportPage />} />
        <Route path="/advisor" element={<TacticalAdvisorPage />} />
        <Route path="/lessons" element={<LessonListPage />} />
        <Route path="/lesson/new" element={<LessonPage />} />
        <Route path="/lesson/:id" element={<LessonDetailPage />} />
        <Route path="/board" element={<TacticalBoardPage />} />
        <Route path="/scouting" element={<ScoutingDashboardPage />} />
        <Route path="/scouting/new" element={<ScoutingEditorPage />} />
        <Route path="/scouting/edit/:id" element={<ScoutingEditorPage />} />
        <Route path="/plan/:opponentId" element={<GamePlanPage />} />
      </Routes>
    </Router>
  )
}
