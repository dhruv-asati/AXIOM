import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  Clock3,
  DoorOpen,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  TicketCheck,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { checkApiHealth } from '../api/health'

const metrics = [
  { label: 'Total rooms', icon: Building2, note: 'Room data contract pending' },
  { label: 'Active bookings', icon: TicketCheck, note: 'Booking data contract pending' },
  { label: 'Pending booking requests', icon: CalendarDays, note: 'Booking data contract pending' },
  { label: 'Room utilisation', icon: ChartNoAxesCombined, note: 'Utilisation data contract pending' },
]

const quickActions = [
  { label: 'View Timetable', description: 'Classes and sessions', to: '/timetable', icon: CalendarRange },
  { label: 'Manage Rooms', description: 'Spaces and venues', to: '/rooms', icon: DoorOpen },
  { label: 'Review Bookings', description: 'Requests and decisions', to: '/bookings', icon: TicketCheck },
  { label: 'Manage Examinations', description: 'Exam coordination', to: '/examinations', icon: UsersRound },
  { label: 'View Disruptions', description: 'Schedule changes', to: '/disruptions', icon: ShieldAlert },
]

type ApiState = 'checking' | 'available' | 'unavailable'

function MetricCard({ label, note, icon: Icon }: (typeof metrics)[number]) {
  return (
    <article className="dashboard-metric-card">
      <div className="dashboard-metric-top">
        <span className="dashboard-metric-icon"><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
        <span className="metric-unavailable-label">Unavailable</span>
      </div>
      <p className="dashboard-metric-label">{label}</p>
      <div className="dashboard-metric-value" aria-label={`${label}: unavailable`}>—</div>
      <p className="dashboard-metric-note">{note}</p>
    </article>
  )
}

function EmptyDataState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="dashboard-empty-state">
      <span className="dashboard-empty-icon"><Activity size={18} strokeWidth={1.7} aria-hidden="true" /></span>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

export function DashboardPage() {
  const [apiState, setApiState] = useState<ApiState>('checking')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const refreshConnection = useCallback(async (signal?: AbortSignal) => {
    setApiState('checking')
    try {
      await checkApiHealth(signal)
      if (signal?.aborted) return
      setApiState('available')
    } catch {
      if (signal?.aborted) return
      setApiState('unavailable')
    } finally {
      if (!signal?.aborted) setLastChecked(new Date())
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refreshConnection(controller.signal)
    return () => controller.abort()
  }, [refreshConnection])

  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="campus-dashboard">
      <header className="dashboard-page-header">
        <div>
          <p className="page-eyebrow">CAMPUS OPERATIONS</p>
          <h1>Campus Overview</h1>
          <p className="page-description">Monitor the spaces, bookings, and schedules that keep campus operations moving.</p>
        </div>
        <div className="dashboard-header-tools">
          <div className="dashboard-date"><CalendarDays size={16} strokeWidth={1.7} aria-hidden="true" /><span>{today}</span></div>
          <button
            className="dashboard-refresh-button"
            type="button"
            onClick={() => void refreshConnection()}
            disabled={apiState === 'checking'}
          >
            {apiState === 'checking'
              ? <LoaderCircle size={15} className="is-spinning" aria-hidden="true" />
              : <RefreshCw size={15} aria-hidden="true" />}
            <span>{apiState === 'checking' ? 'Checking' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      <div className={`dashboard-connection-note is-${apiState}`} role="status" aria-live="polite">
        <span className="connection-indicator" aria-hidden="true" />
        <span>
          {apiState === 'checking' && 'Checking the documented API health endpoint…'}
          {apiState === 'available' && 'API is reachable. Dashboard data contracts are not yet defined.'}
          {apiState === 'unavailable' && 'Could not reach the API health endpoint. Dashboard data contracts are also pending.'}
        </span>
        {lastChecked && <time dateTime={lastChecked.toISOString()}>Checked {lastChecked.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time>}
      </div>

      <section className="dashboard-kpis" aria-label="Campus key metrics">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <section className="dashboard-main-grid" aria-label="Campus operations details">
        <article className="dashboard-panel utilisation-panel">
          <div className="dashboard-panel-heading">
            <div><p className="section-eyebrow">SPACE PERFORMANCE</p><h2>Room utilisation</h2></div>
            <span className="panel-data-status"><span />No data</span>
          </div>
          <p className="panel-description">Occupancy across campus rooms</p>
          <div className="utilisation-chart-empty">
            <div className="chart-guides" aria-hidden="true"><i /><i /><i /><i /></div>
            <EmptyDataState title="Utilisation data unavailable" detail="A documented occupancy source is needed to show a chart." />
          </div>
        </article>

        <article className="dashboard-panel occupancy-panel">
          <div className="dashboard-panel-heading">
            <div><p className="section-eyebrow">LIVE SNAPSHOT</p><h2>Occupancy</h2></div>
            <span className="occupancy-glyph"><Building2 size={18} aria-hidden="true" /></span>
          </div>
          <p className="panel-description">Current room and campus occupancy</p>
          <div className="occupancy-empty">
            <span className="occupancy-empty-value">—</span>
            <span>Not available</span>
          </div>
          <p className="occupancy-footnote">Occupancy details will appear when an agreed data contract is available.</p>
        </article>

        <article className="dashboard-panel booking-panel">
          <div className="dashboard-panel-heading">
            <div><p className="section-eyebrow">VENUE OPERATIONS</p><h2>Booking activity</h2></div>
            <Link className="panel-link" to="/bookings">All bookings <ArrowUpRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead><tr><th>Venue</th><th>Request date &amp; time</th><th>Status</th></tr></thead>
              <tbody><tr><td colSpan={3}><EmptyDataState title="No booking requests to display" detail="Requests will appear here when the booking API contract is available." /></td></tr></tbody>
            </table>
          </div>
        </article>

        <article className="dashboard-panel schedule-panel">
          <div className="dashboard-panel-heading">
            <div><p className="section-eyebrow">UP NEXT</p><h2>Schedule overview</h2></div>
            <Link className="panel-link" to="/timetable">Timetable <ArrowUpRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className="dashboard-table-wrap">
            <table className="dashboard-table schedule-table">
              <thead><tr><th>Course</th><th>Faculty</th><th>Room</th><th>Time</th></tr></thead>
              <tbody><tr><td colSpan={4}><EmptyDataState title="No upcoming sessions to display" detail="Schedule data will appear here when a session listing is documented." /></td></tr></tbody>
            </table>
          </div>
        </article>

        <section className="dashboard-panel quick-actions-panel" aria-labelledby="quick-actions-heading">
          <div className="dashboard-panel-heading">
            <div><p className="section-eyebrow">SHORTCUTS</p><h2 id="quick-actions-heading">Quick actions</h2></div>
          </div>
          <div className="quick-action-list">
            {quickActions.map(({ label, description, to, icon: Icon }) => (
              <Link className="quick-action-link" to={to} key={to}>
                <span className="quick-action-icon"><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="quick-action-copy"><strong>{label}</strong><small>{description}</small></span>
                <ArrowUpRight size={15} className="quick-action-arrow" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>

        <section className="dashboard-panel recent-activity-panel" aria-labelledby="recent-activity-heading">
          <div className="dashboard-panel-heading">
            <div><p className="section-eyebrow">CAMPUS FEED</p><h2 id="recent-activity-heading">Recent activity</h2></div>
            <Clock3 size={17} className="activity-heading-icon" aria-hidden="true" />
          </div>
          <EmptyDataState title="No activity available" detail="Only backend-provided activity will appear here once its source is documented." />
        </section>
      </section>
    </div>
  )
}
