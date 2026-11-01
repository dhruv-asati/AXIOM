import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { AuthenticatedCanvasLayout } from './components/layout/AuthenticatedCanvasLayout'
import { DatasetProvider } from './context/DatasetContext'
import { SkeletonCard, SkeletonPage, SkeletonStats } from './components/ui/Skeleton'
import { AuthProvider } from './auth/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { ROUTE_ROLES } from './auth/roleAccess.mjs'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import './pages/PublicPages.css'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const DatasetsPage = lazy(() => import('./pages/DatasetsPage').then((module) => ({ default: module.DatasetsPage })))
const TimetablePage = lazy(() => import('./pages/TimetablePage').then((module) => ({ default: module.TimetablePage })))
const RoomsPage = lazy(() => import('./pages/RoomsPage').then((module) => ({ default: module.RoomsPage })))
const BookingsPage = lazy(() => import('./pages/BookingsPage').then((module) => ({ default: module.BookingsPage })))
const ExaminationsPage = lazy(() => import('./pages/ExaminationsPage').then((module) => ({ default: module.ExaminationsPage })))
const DisruptionsPage = lazy(() => import('./pages/DisruptionsPage').then((module) => ({ default: module.DisruptionsPage })))
const AssistantPage = lazy(() => import('./pages/AssistantPage').then((module) => ({ default: module.AssistantPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

function PageFallback() {
  return <SkeletonPage label="Loading page"><SkeletonStats count={4} /><SkeletonCard /><SkeletonCard /></SkeletonPage>
}

function ForbiddenPage() {
  return <main className="forbidden-page"><div className="public-brand"><span className="public-brand-mark">A</span><span>AXIOM<span className="brand-period">.</span></span></div><span className="public-eyebrow">ACCESS CONTROL</span><h1>This workspace is outside your role.</h1><p>Sign in with an account that has permission for this area, or return to your role-specific workspace.</p><Link className="button-primary" to="/">Go to my workspace</Link></main>
}

function App() {
  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><ThemeProvider><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AuthenticatedCanvasLayout />}>
        <Route element={<DatasetProvider><MainLayout /></DatasetProvider>}>
          <Route path="/dashboard" element={<ProtectedRoute roles={ROUTE_ROLES.admin} />}><Route index element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} /></Route>
          <Route path="/datasets" element={<ProtectedRoute roles={ROUTE_ROLES.admin} />}><Route index element={<Suspense fallback={<PageFallback />}><DatasetsPage /></Suspense>} /></Route>
          <Route path="/timetable" element={<ProtectedRoute roles={ROUTE_ROLES.teaching} />}><Route index element={<Suspense fallback={<PageFallback />}><TimetablePage /></Suspense>} /></Route>
          <Route path="/rooms" element={<ProtectedRoute roles={ROUTE_ROLES.venue} />}><Route index element={<Suspense fallback={<PageFallback />}><RoomsPage /></Suspense>} /></Route>
          <Route path="/bookings" element={<ProtectedRoute roles={ROUTE_ROLES.venue} />}><Route index element={<Suspense fallback={<PageFallback />}><BookingsPage /></Suspense>} /></Route>
          <Route path="/examinations" element={<ProtectedRoute roles={ROUTE_ROLES.adminDepartment} />}><Route index element={<Suspense fallback={<PageFallback />}><ExaminationsPage /></Suspense>} /></Route>
          <Route path="/disruptions" element={<ProtectedRoute roles={ROUTE_ROLES.teaching} />}><Route index element={<Suspense fallback={<PageFallback />}><DisruptionsPage /></Suspense>} /></Route>
          <Route path="/assistant" element={<ProtectedRoute roles={ROUTE_ROLES.teaching} />}><Route index element={<Suspense fallback={<PageFallback />}><AssistantPage /></Suspense>} /></Route>
          <Route path="/analytics" element={<ProtectedRoute roles={ROUTE_ROLES.admin} />}><Route index element={<Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense>} /></Route>
          <Route path="/settings" element={<ProtectedRoute roles={ROUTE_ROLES.admin} />}><Route index element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} /></Route>
          <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFoundPage /></Suspense>} />
        </Route>
        <Route path="/forbidden" element={<ProtectedRoute roles={ROUTE_ROLES.signedIn} />}><Route index element={<ForbiddenPage />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></ThemeProvider></AuthProvider></BrowserRouter>
}

export default App
