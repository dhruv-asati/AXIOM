import { HoverMember } from '../components/HoverMember'
import { CrowdCanvas } from '../components/CrowdCanvas'
import { ArrowUpRight, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import './PublicPages.css'

const projectFeatures = [
  { name: 'TIMETABLES', image: '/images/features/timetables.svg', description: 'Generate a complete weekly timetable with the OR-Tools CP-SAT solver. Faculty, rooms, student groups, availability and campus scheduling rules shape the result.' },
  { name: 'VALIDATION', image: '/images/features/validation.svg', description: 'Check schedules for room, faculty and student-group clashes and validate the exported schedule against the official starter-pack validator.' },
  { name: 'VENUE BOOKINGS', image: '/images/features/venues.svg', description: 'Process requests in deterministic priority and submission order. The engine checks role caps, cancellations, room capacity and accessibility, unavailability, timetable conflicts and approved bookings.' },
  { name: 'EXAMINATIONS', image: '/images/features/examinations.svg', description: 'Represent examinations as schedule sessions and connect them to their allocated rooms, keeping exam planning within the same dataset-aware scheduling model.' },
  { name: 'RESCHEDULING', image: '/images/features/rescheduling.svg', description: 'Prepare disruption repair proposals against a baseline schedule. Proposed changes remain reviewable before they are approved.' },
  { name: 'REQUEST PARSING', image: '/images/features/assistant.svg', description: 'Turn natural-language scheduling and booking requests into structured proposals. The assistant supports the workflow while deterministic rules remain responsible for decisions.' },
  { name: 'DECISIONS', image: '/images/features/decisions.svg', description: 'Store booking outcomes and explanations so reviewers can understand why a request was approved or rejected and what constraints affected the result.' },
  { name: 'ROLE ACCESS', image: '/images/features/roles.svg', description: 'Provide role-specific access for campus administrators, department coordinators, faculty and club representatives, with permissions enforced by the authenticated session.' },
]

export function LandingPage() {
  const { theme, toggleTheme } = useTheme()
  return (
    <main className="landing-showcase" data-theme={theme} aria-label="AXIOM project features">
      <CrowdCanvas />
      <button className="landing-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <Link className="landing-sign-in" to="/login">Sign in <ArrowUpRight size={15} /></Link>
      <div className="landing-feature-content">
        <h1 className="landing-brand-title">AXIOM</h1>
        <HoverMember
          teamMembers={projectFeatures}
          brandText="AXIOM"
          groupLabel="AXIOM project features"
          showDescription
        />
      </div>
    </main>
  )
}
