import { HashRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from './pages/Home'
import { MatchSetupPage } from './pages/MatchSetup'
import { MatchPage } from './pages/Match'
import { MatchReportPage } from './pages/MatchReport'
import { TacticalAdvisorPage } from './pages/TacticalAdvisor'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/match-setup" element={<MatchSetupPage />} />
        <Route path="/match" element={<MatchPage />} />
        <Route path="/report/:id" element={<MatchReportPage />} />
        <Route path="/advisor" element={<TacticalAdvisorPage />} />
      </Routes>
    </HashRouter>
  )
}
