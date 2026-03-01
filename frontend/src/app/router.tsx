import { Navigate, createBrowserRouter } from 'react-router-dom'

import { AppShell } from '../components/layout/AppShell'
import { PublicLayout } from '../components/layout/PublicLayout'
import { LoginPage } from '../features/auth/LoginPage'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { RegisterPage } from '../features/auth/RegisterPage'
import { HistoryPage } from '../features/common/HistoryPage'
import { NotFoundPage } from '../features/common/NotFoundPage'
import { SettingsPage } from '../features/common/SettingsPage'
import { DisclaimerPage } from '../features/legal/DisclaimerPage'
import { PrivacyPage } from '../features/legal/PrivacyPage'
import { TermsPage } from '../features/legal/TermsPage'
import { AboutPage } from '../features/marketing/AboutPage'
import { LandingPage } from '../features/marketing/LandingPage'
import { DashboardPage } from '../features/jobs/DashboardPage'
import { JobStatusPage } from '../features/jobs/JobStatusPage'
import { ResultsPage } from '../features/jobs/ResultsPage'
import { IntelligenceHubLayout } from '../features/intelligence/IntelligenceHubLayout'
import { IntelligencePortfolioPage } from '../features/intelligence/IntelligencePortfolioPage'
import { IntelligenceCompliancePage } from '../features/intelligence/IntelligenceCompliancePage'
import { IntelligenceRiskPage } from '../features/intelligence/IntelligenceRiskPage'
import { IntelligenceOperationsPage } from '../features/intelligence/IntelligenceOperationsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'legal/terms', element: <TermsPage /> },
      { path: 'legal/privacy', element: <PrivacyPage /> },
      { path: 'legal/disclaimer', element: <DisclaimerPage /> },
    ],
  },
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      {
        path: '',
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/app/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          {
            path: 'intelligence',
            element: <IntelligenceHubLayout />,
            children: [
              { index: true, element: <Navigate to="/app/intelligence/portfolio" replace /> },
              { path: 'portfolio', element: <IntelligencePortfolioPage /> },
              { path: 'compliance', element: <IntelligenceCompliancePage /> },
              { path: 'risk', element: <IntelligenceRiskPage /> },
              { path: 'operations', element: <IntelligenceOperationsPage /> },
            ],
          },
          { path: 'jobs/:jobId', element: <JobStatusPage /> },
          { path: 'results/:jobId', element: <ResultsPage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'about', element: <AboutPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
