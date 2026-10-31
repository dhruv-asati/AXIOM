import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
<<<<<<< HEAD
import { DatasetProvider } from './context/DatasetContext'
import { SkeletonCard, SkeletonPage, SkeletonStats } from './components/ui/Skeleton'

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
  return <SkeletonPage label="Loading page">
    <SkeletonStats count={4} />
    <SkeletonCard />
    <SkeletonCard />
  </SkeletonPage>
}
=======
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { RoomsPage } from './pages/RoomsPage'
import { BookingsPage } from './pages/BookingsPage'
import { TimetablePage } from './pages/TimetablePage'
import { ExaminationsPage } from './pages/ExaminationsPage'
import { DisruptionsPage } from './pages/DisruptionsPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AssistantPage } from './pages/AssistantPage'

const sections = [
  { path: 'settings', title: 'Settings', description: 'Configure your AXIOM workspace preferences.' },
]
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<DatasetProvider><MainLayout /></DatasetProvider>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
<<<<<<< HEAD
          <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
          <Route path="/datasets" element={<Suspense fallback={<PageFallback />}><DatasetsPage /></Suspense>} />
          <Route path="/timetable" element={<Suspense fallback={<PageFallback />}><TimetablePage /></Suspense>} />
          <Route path="/rooms" element={<Suspense fallback={<PageFallback />}><RoomsPage /></Suspense>} />
          <Route path="/bookings" element={<Suspense fallback={<PageFallback />}><BookingsPage /></Suspense>} />
          <Route path="/examinations" element={<Suspense fallback={<PageFallback />}><ExaminationsPage /></Suspense>} />
          <Route path="/disruptions" element={<Suspense fallback={<PageFallback />}><DisruptionsPage /></Suspense>} />
          <Route path="/assistant" element={<Suspense fallback={<PageFallback />}><AssistantPage /></Suspense>} />
          <Route path="/analytics" element={<Suspense fallback={<PageFallback />}><AnalyticsPage /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
          <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFoundPage /></Suspense>} />
=======
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/examinations" element={<ExaminationsPage />} />
          <Route path="/disruptions" element={<DisruptionsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          {sections.map((section) => (
            <Route
              key={section.path}
              path={`/${section.path}`}
              element={<PlaceholderPage title={section.title} description={section.description} />}
            />
          ))}
          <Route path="*" element={<NotFoundPage />} />
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
