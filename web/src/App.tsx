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
import { VideoToScenarioPage } from './pages/VideoToScenario'
import { SyncListPage } from './pages/SyncList'
import { SyncCapturePage } from './pages/SyncCapture'
import { SyncReplayPage } from './pages/SyncReplay'
import { SyncTrajectoryPage } from './pages/SyncTrajectory'
import { ProAnalyticsPage } from './pages/ProAnalytics'

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
        <Route path="/video-to-3d" element={<VideoToScenarioPage />} />
        <Route path="/sync" element={<SyncListPage />} />
        <Route path="/sync/new" element={<SyncCapturePage />} />
        <Route path="/sync/:id" element={<SyncReplayPage />} />
        <Route path="/sync/:id/3d" element={<SyncTrajectoryPage />} />
        <Route path="/sync/:id/pro" element={<ProAnalyticsPage />} />
      </Routes>
    </Router>
  )
}
