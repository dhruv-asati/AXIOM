import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { MainLayout } from './components/layout/MainLayout'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { TimetablePage } from './pages/TimetablePage'

const sections = [
  { path: 'rooms', title: 'Room Management', description: 'Manage campus rooms, venues, and their availability.' },
  { path: 'bookings', title: 'Bookings', description: 'Review venue booking requests and their decisions.' },
  { path: 'examinations', title: 'Examinations', description: 'Coordinate examination schedules and assigned venues.' },
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
