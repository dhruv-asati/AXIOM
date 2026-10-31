import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { RoomsPage } from './pages/RoomsPage'
import { BookingsPage } from './pages/BookingsPage'
import { TimetablePage } from './pages/TimetablePage'
import { ExaminationsPage } from './pages/ExaminationsPage'

const sections = [
  { path: 'disruptions', title: 'Disruptions', description: 'Coordinate schedule changes when campus plans are disrupted.' },
  { path: 'analytics', title: 'Analytics', description: 'Explore campus scheduling and room utilisation insights.' },
  { path: 'settings', title: 'Settings', description: 'Configure your AXIOM workspace preferences.' },
]

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/rooms" element={<RoomsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/examinations" element={<ExaminationsPage />} />
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
