import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, AlertCircle, ArrowUpRight, CalendarDays, ChartNoAxesCombined, DoorOpen, LoaderCircle, RefreshCw, TicketCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatedLink } from '../components/ui/AnimatedLink'
import { getDashboardSummary } from '../api/datasets'
import { listBookings } from '../api/resources'
import { invalidateApiCache } from '../api/client'
import { SkeletonCard, SkeletonPage, SkeletonStats, SkeletonTable } from '../components/ui/Skeleton'
import { useDatasetContext } from '../context/DatasetContext'
import type { BookingRequestRecord, DashboardSummary } from '../types/api'
import { PageHeader } from '../components/layout/PageHeader'
import { SpecularCard } from '../components/ui/SpecularCard'
import './Operations.css'

export function DashboardPage() {
  const { datasets, selectedDatasetId, selectedDataset, loading: datasetsLoading, error: datasetsError, refresh: refreshDatasets, selectDataset } = useDatasetContext()
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [bookings, setBookings] = useState<BookingRequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadedDatasetId, setLoadedDatasetId] = useState('')
  const requestController = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setLoading(true)
    setError('')
    if (!selectedDatasetId) {
      setSummary(null)
      setBookings([])
      setLoadedDatasetId('')
      setLoading(false)
      return
    }
    invalidateApiCache(`/datasets/${selectedDatasetId}`)
    try {
      const [stats, requests] = await Promise.all([
        getDashboardSummary(selectedDatasetId, controller.signal),
        listBookings(selectedDatasetId, undefined, controller.signal),
      ])
      if (controller.signal.aborted) return
      setSummary(stats)
      setBookings(requests.slice(0, 5))
      setLoadedDatasetId(selectedDatasetId)
      setApiAvailable(true)
    } catch (cause) {
      if (controller.signal.aborted) return
      setApiAvailable(false)
      setError(cause instanceof Error ? cause.message : 'Dashboard data could not be loaded')
      setLoadedDatasetId(selectedDatasetId)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [selectedDatasetId])

  useEffect(() => {
    void refresh()
    return () => requestController.current?.abort()
  }, [refresh])

  const currentSummary = loadedDatasetId === selectedDatasetId ? summary : null
  const currentBookings = loadedDatasetId === selectedDatasetId ? bookings : []

  const stats = currentSummary?.counts
  const cards = [
    ['Faculty', stats?.faculty], ['Student groups', stats?.student_groups], ['Courses', stats?.courses],
    ['Rooms', stats?.rooms], ['Timetable sessions', stats?.timetable_sessions], ['Examinations', stats?.examinations],
  ] as const

  return <div className="ops-page">
    <PageHeader eyebrow="CAMPUS OPERATIONS" title="Campus overview" description="Live dataset, schedule, booking, and venue information from the selected campus dataset." action={<button type="button" className="ops-button" disabled={loading} onClick={() => void refresh()}>{loading ? <LoaderCircle size={14} className="is-spinning" /> : <RefreshCw size={14} />}Refresh</button>} />
    <div className={`ops-message ${apiAvailable === false ? 'error' : ''}`} role="status">
      {apiAvailable === false ? <AlertCircle size={15} /> : <Activity size={15} />}
      {apiAvailable === null ? (selectedDatasetId && loading ? 'Loading the selected dataset…' : 'Dataset catalog and live data are loaded from the AXIOM API.') : apiAvailable ? 'API reachable. Database-backed cards are shown only when the configured schema and dataset are available.' : error || 'API unavailable. Retry to reload.'}
    </div>
    {datasetsError && <div className="ops-message error" role="alert">{datasetsError}<button type="button" className="ops-button" onClick={() => void refreshDatasets()}>Retry dataset list</button></div>}
    {datasetsLoading && !selectedDatasetId && <SkeletonPage label="Loading dataset catalog"><SkeletonStats count={6} /><SkeletonStats count={4} /><section className="ops-card-grid"><SkeletonCard /><SkeletonCard /></section><section className="ops-card-grid"><article className="ops-card"><SkeletonTable rows={5} columns={4} /></article><article className="ops-card"><SkeletonTable rows={5} columns={4} /></article></section></SkeletonPage>}
    <section className="ops-toolbar">
      <label className="ops-field">Active dataset
        <select value={selectedDatasetId} disabled={datasetsLoading || datasets.length === 0} onChange={(event) => selectDataset(event.target.value)}>
          {datasets.length === 0 && <option value="">No imported datasets</option>}
          {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.source_dataset_id} · {dataset.institute}</option>)}
        </select>
      </label>
      {selectedDataset && <span className="ops-badge good">{selectedDataset.source_dataset_id}</span>}
      <Link to="/datasets" className="ops-button"><ArrowUpRight size={14} />Manage datasets</Link>
    </section>
    {!selectedDatasetId && !datasetsLoading && <div className="ops-empty"><CalendarDays size={20} /><strong>Import a dataset to start</strong><span>AXIOM does not fill the dashboard with sample campus data.</span><AnimatedLink className="ops-link" to="/datasets">Open dataset management</AnimatedLink></div>}
    {loading && currentSummary && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton" />Refreshing this dataset…</span>}
    {error && selectedDatasetId && <div className="ops-message error" role="alert">{error}<button className="ops-button" type="button" onClick={() => void refresh()}>Retry</button></div>}
    {selectedDatasetId && loadedDatasetId !== selectedDatasetId && !error && <SkeletonPage label="Loading campus dashboard"><SkeletonStats count={6} /><SkeletonStats count={4} /><section className="ops-card-grid"><SkeletonCard /><SkeletonCard /></section><section className="ops-card-grid"><article className="ops-card"><SkeletonTable rows={5} columns={4} /></article><article className="ops-card"><SkeletonTable rows={5} columns={4} /></article></section><article className="ops-card"><SkeletonTable rows={3} columns={3} /></article></SkeletonPage>}
    {currentSummary && <>
      <section className="ops-grid" aria-label="Selected dataset counts">{cards.map(([label, value]) => <SpecularCard as="article" className="ops-stat" key={label}><span>{label}</span><strong>{value ?? '—'}</strong><small>{selectedDataset?.source_dataset_id}</small></SpecularCard>)}</section>
      <section className="ops-grid">
        <SpecularCard as="article" className="ops-stat"><span>Available schedules</span><strong>{currentSummary.schedule_count}</strong><small>{currentSummary.latest_schedule ? `Latest: ${currentSummary.latest_schedule.status}` : 'Generate a schedule to begin'}</small></SpecularCard>
        <SpecularCard as="article" className="ops-stat"><span>Approved bookings</span><strong>{currentSummary.booking_counts.approved}</strong><small>For the latest schedule</small></SpecularCard>
        <SpecularCard as="article" className="ops-stat"><span>Rejected bookings</span><strong>{currentSummary.booking_counts.rejected}</strong><small>For the latest schedule</small></SpecularCard>
        <SpecularCard as="article" className="ops-stat"><span>Pending requests</span><strong>{currentSummary.booking_counts.pending}</strong><small>For the latest schedule</small></SpecularCard>
      </section>
      <section className="ops-card-grid">
        <article className="ops-card"><div className="ops-card-heading"><div><h2>Room utilisation</h2><p>{currentSummary.room_utilisation_definition}</p></div><ChartNoAxesCombined size={18} /></div><strong style={{ fontSize: 28 }}>{currentSummary.room_utilisation_percent === null ? '—' : `${currentSummary.room_utilisation_percent}%`}</strong><p className="ops-inline-note">{currentSummary.latest_schedule ? 'Calculated from the latest persisted schedule and room unavailability.' : 'Unavailable until a persisted schedule exists.'}</p></article>
        <article className="ops-card"><div className="ops-card-heading"><div><h2>Live occupancy</h2><p>Current occupancy requires a real-time room check-in source.</p></div><DoorOpen size={18} /></div><strong style={{ fontSize: 24 }}>Not available</strong><p className="ops-inline-note">AXIOM has recurring weekly assignments, not live occupancy telemetry.</p></article>
      </section>
      <section className="ops-card-grid">
        <article className="ops-card"><div className="ops-card-heading"><div><h2>Weekly schedule preview</h2><p>First assignments in the recurring weekly pattern, not live “up next” telemetry.</p></div><AnimatedLink className="ops-link" to="/timetable">Open timetable <ArrowUpRight size={13} /></AnimatedLink></div>
          {currentSummary.upcoming_sessions.length === 0 ? <div className="ops-empty"><CalendarDays size={18} /><strong>No scheduled sessions</strong><span>Generate a timetable for this dataset.</span></div> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Course</th><th>Day / period</th><th>Faculty</th><th>Room</th></tr></thead><tbody>{currentSummary.upcoming_sessions.map((session) => <tr key={session.session_id}><td>{session.course_name}</td><td>{session.day} · P{session.start_period}–P{session.end_period}</td><td>{session.faculty_name}</td><td>{session.room_name} · {session.room_id}</td></tr>)}</tbody></table></div>}
        </article>
        <article className="ops-card"><div className="ops-card-heading"><div><h2>Booking activity</h2><p>Recent requests from the selected dataset.</p></div><AnimatedLink className="ops-link" to="/bookings">All bookings <ArrowUpRight size={13} /></AnimatedLink></div>
          {currentBookings.length === 0 ? <div className="ops-empty"><TicketCheck size={18} /><strong>No booking requests</strong><span>Parsed or imported requests appear here after submission.</span></div> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Event</th><th>Requester</th><th>Priority</th><th>Status</th></tr></thead><tbody>{currentBookings.map((booking) => <tr key={booking.request_id}><td>{booking.title}</td><td>{booking.requester}</td><td>{booking.effective_category}</td><td><span className={`ops-badge ${booking.status === 'approved' ? 'good' : booking.status === 'rejected' ? 'bad' : 'warn'}`}>{booking.status}</span></td></tr>)}</tbody></table></div>}
        </article>
      </section>
      <section className="ops-card"><div className="ops-card-heading"><div><h2>Recent disruption proposals</h2><p>Repair proposals require approval before they create a new schedule.</p></div><AnimatedLink className="ops-link" to="/disruptions">Manage disruptions <ArrowUpRight size={13} /></AnimatedLink></div>
        {currentSummary.recent_repair_proposals.length === 0 ? <div className="ops-empty"><Activity size={18} /><strong>No repair proposals</strong><span>New disruption proposals are listed here when submitted.</span></div> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Status</th><th>Created</th><th>Explanation</th></tr></thead><tbody>{currentSummary.recent_repair_proposals.map((proposal) => <tr key={proposal.proposal_id}><td><span className="ops-badge">{proposal.status}</span></td><td>{new Date(proposal.created_at).toLocaleString()}</td><td className="wrap-cell">{proposal.explanation}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
  </div>
}
