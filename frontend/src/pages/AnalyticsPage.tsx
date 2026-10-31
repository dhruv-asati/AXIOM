<<<<<<< HEAD
import { useEffect, useState } from 'react'
import { AlertCircle, BarChart3 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { getDashboardSummary } from '../api/datasets'
import { useDatasetContext } from '../context/DatasetContext'
import type { DashboardSummary } from '../types/api'
import './Operations.css'
import { SkeletonCard, SkeletonPage, SkeletonStats } from '../components/ui/Skeleton'

export function AnalyticsPage() {
  const { selectedDatasetId } = useDatasetContext()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadedDatasetId, setLoadedDatasetId] = useState('')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setSummary(null); setLoadedDatasetId('')
    if (!selectedDatasetId) { setSummary(null); setLoading(false); return () => controller.abort() }
    setLoading(true); setError('')
    getDashboardSummary(selectedDatasetId, controller.signal).then((data) => { if (active) { setSummary(data); setLoadedDatasetId(selectedDatasetId) } }).catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Analytics unavailable')).finally(() => active && setLoading(false))
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId])
  return <div className="ops-page"><PageHeader eyebrow="CAMPUS INSIGHTS" title="Analytics" description="Dataset counts and utilisation calculated from persisted schedules. No synthetic metrics are shown."/>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15}/>{error}</div>}{loading && loadedDatasetId === selectedDatasetId && summary && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton"/>Refreshing analytics…</span>}
    {loading && selectedDatasetId && loadedDatasetId !== selectedDatasetId && <SkeletonPage label="Loading analytics"><SkeletonStats count={6}/><section className="ops-card-grid"><SkeletonCard/><SkeletonCard/></section></SkeletonPage>}
    {!loading && !error && !selectedDatasetId && <div className="ops-empty"><BarChart3 size={20}/><strong>Select or import a dataset</strong><span>Analytics are scoped to the active dataset.</span></div>}
    {loadedDatasetId === selectedDatasetId && summary && <><div className="ops-grid">{Object.entries(summary.counts).map(([name, value]) => <div className="ops-stat" key={name}><span>{name.replaceAll('_', ' ')}</span><strong>{value}</strong></div>)}</div><section className="ops-card"><div className="ops-card-heading"><div><h2>Schedule and bookings</h2><p>{summary.source_dataset_id} · {summary.institute}</p></div></div><div className="ops-grid"><div className="ops-stat"><span>Schedules</span><strong>{summary.schedule_count}</strong></div><div className="ops-stat"><span>Latest schedule</span><strong>{summary.latest_schedule?.status ?? 'None'}</strong></div><div className="ops-stat"><span>Room utilisation</span><strong>{summary.room_utilisation_percent === null ? 'Unavailable' : `${summary.room_utilisation_percent}%`}</strong><small>{summary.room_utilisation_definition}</small></div>{Object.entries(summary.booking_counts).map(([key, value]) => <div className="ops-stat" key={key}><span>Bookings {key.replace('_', ' ')}</span><strong>{value}</strong></div>)}</div></section></>}
  </div>
=======
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
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08
}
