import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LayoutShell from './layout/LayoutShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardSnapshotsPage from './pages/dashboard/DashboardSnapshotsPage.jsx';
import DashboardTeamsPage from './pages/dashboard/DashboardTeamsPage.jsx';
import ScheduleTimelinePage from './pages/schedule/ScheduleTimelinePage.jsx';
import ScheduleStaffingPage from './pages/schedule/ScheduleStaffingPage.jsx';
import TalentRosterPage from './pages/talent/TalentRosterPage.jsx';
import RulesLibraryPage from './pages/rules/RulesLibraryPage.jsx';
import RulesPoliciesPage from './pages/rules/RulesPoliciesPage.jsx';
import InsightsPerformancePage from './pages/insights/InsightsPerformancePage.jsx';
import InsightsTrendsPage from './pages/insights/InsightsTrendsPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<LayoutShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardSnapshotsPage />} />
          <Route path="/dashboard/teams" element={<DashboardTeamsPage />} />
          <Route path="/schedule/timeline" element={<ScheduleTimelinePage />} />
          <Route path="/schedule/staffing" element={<ScheduleStaffingPage />} />
          <Route path="/talent/roster" element={<TalentRosterPage />} />
          <Route path="/rules/library" element={<RulesLibraryPage />} />
          <Route path="/rules/policies" element={<RulesPoliciesPage />} />
          <Route path="/insights/performance" element={<InsightsPerformancePage />} />
          <Route path="/insights/trends" element={<InsightsTrendsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
