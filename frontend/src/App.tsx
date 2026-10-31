import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<DatasetProvider><MainLayout /></DatasetProvider>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
