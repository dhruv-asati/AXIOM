import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  ChartColumnIncreasing,
  FileBarChart,
  LoaderCircle,
  RefreshCw,
  TicketCheck,
} from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { loadAnalyticsAvailability } from '../api/analytics'

type AnalyticsState = 'loading' | 'unavailable' | 'error'

const insightSections = [
  { id: 'room-utilisation', eyebrow: 'SPACE PERFORMANCE', title: 'Room utilisation', description: 'Usage by building, room type, and occupancy trend.', icon: Building2 },
  { id: 'booking-activity', eyebrow: 'VENUE OPERATIONS', title: 'Booking activity', description: 'Booking volume, status distribution, and department activity.', icon: TicketCheck },
  { id: 'schedule-metrics', eyebrow: 'ACADEMIC OPERATIONS', title: 'Timetable & examinations', description: 'Solver-provided schedule and examination metrics.', icon: CalendarDays },
]

function MetricUnavailable({ icon: Icon, title, description }: { icon: typeof Building2; title: string; description: string }) {
  return (
    <article className="analytics-metric-card">
      <span className="analytics-metric-icon"><Icon size={17} aria-hidden="true" /></span>
      <div><strong>{title}</strong><p>{description}</p></div>
      <span className="analytics-unavailable-chip">Unavailable</span>
    </article>
  )
}

export function AnalyticsPage() {
  const [state, setState] = useState<AnalyticsState>('loading')
  const [reason, setReason] = useState('')

  const refresh = useCallback(async () => {
    setState('loading')
    setReason('')
    try {
      const result = await loadAnalyticsAvailability()
      setState(result.status)
      setReason(result.reason)
    } catch {
      setState('error')
      setReason('Analytics information could not be loaded. Check the connection and try again.')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div className="analytics-page">
      <PageHeader
        className="analytics-page-header"
        eyebrow="CAMPUS INSIGHTS"
        title="Analytics & Reports"
        description="Explore operational insights from authoritative campus data."
        action={<button type="button" className="analytics-refresh-button" onClick={() => void refresh()} disabled={state === 'loading'}>{state === 'loading' ? <LoaderCircle size={14} className="analytics-spin" /> : <RefreshCw size={14} />}<span>{state === 'loading' ? 'Loading' : 'Refresh'}</span></button>}
      />

      {state !== 'loading' && <div className={`analytics-connection-state is-${state}`} role={state === 'error' ? 'alert' : 'status'}>
        <AlertTriangle size={15} aria-hidden="true" />
        <span><strong>{state === 'error' ? 'Analytics unavailable' : 'Analytics data is not connected'}</strong> — {reason}</span>
      </div>}

      <section className="analytics-overview" aria-labelledby="analytics-overview-heading">
        <div className="analytics-section-heading"><div><p>OVERVIEW</p><h2 id="analytics-overview-heading">Campus metrics</h2></div><span className="analytics-section-status"><Activity size={13} />No aggregate data</span></div>
        {state === 'loading' ? <div className="analytics-metric-grid" aria-label="Loading analytics"><i /><i /><i /><i /></div> : <div className="analytics-metric-grid">
          <MetricUnavailable icon={Building2} title="Room metrics" description="Inventory and utilisation totals" />
          <MetricUnavailable icon={TicketCheck} title="Booking metrics" description="Activity and request outcomes" />
          <MetricUnavailable icon={CalendarDays} title="Timetable metrics" description="Schedule activity and utilisation" />
          <MetricUnavailable icon={ChartColumnIncreasing} title="Examination metrics" description="Solver-provided schedule results" />
        </div>}
      </section>

      <section className="analytics-insights-grid" aria-label="Analytics breakdowns">
        {insightSections.map(({ id, eyebrow, title, description, icon: Icon }) => (
          <article className="analytics-insight-card" key={id} aria-labelledby={`${id}-title`}>
            <div className="analytics-insight-heading"><span className="analytics-insight-icon"><Icon size={16} /></span><div><p>{eyebrow}</p><h2 id={`${id}-title`}>{title}</h2></div></div>
            {state === 'loading' ? <div className="analytics-chart-loading" role="status" aria-label={`Loading ${title}`}><i /><i /><i /></div> : <div className="analytics-chart-unavailable" role="status" aria-label={`${title} unavailable`}>
              <span><BarChart3 size={20} aria-hidden="true" /></span>
              <strong>No verified data to chart</strong>
              <p>{description} This view will appear when the backend provides its values and aggregation rules.</p>
            </div>}
          </article>
        ))}
      </section>

      <section className="analytics-reports-card" aria-labelledby="analytics-reports-heading">
        <span className="analytics-report-icon"><FileBarChart size={18} /></span>
        <div><p>REPORTS</p><h2 id="analytics-reports-heading">Reports & exports</h2><span>Report viewing and export are unavailable until a documented report source or export contract is provided.</span></div>
        <span className="analytics-export-status">Export unavailable</span>
      </section>

      <p className="analytics-boundary-note"><AlertTriangle size={14} />The frontend does not derive utilisation, booking trends, solver quality, or schedule validity. Metrics must come from authoritative backend or solver responses.</p>
    </div>
  )
}
