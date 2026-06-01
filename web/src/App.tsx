import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/Home'
import { MatchSetupPage } from './pages/MatchSetup'
import { MatchPage } from './pages/Match'
import { MatchReportPage } from './pages/MatchReport'
import { TacticalAdvisorPage } from './pages/TacticalAdvisor'

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
      </Routes>
    </Router>
  )
}
