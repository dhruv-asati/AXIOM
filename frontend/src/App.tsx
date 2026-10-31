import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
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

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
