import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CalendarClock, Play, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { listBookings, listSchedules, runBookingEngine } from '../api/resources'
import { invalidateApiCache } from '../api/client'
import { useDatasetContext } from '../context/DatasetContext'
import type { BookingRequestRecord, ScheduleSummary } from '../types/api'
import './Operations.css'
import { SkeletonPage, SkeletonStats, SkeletonTable } from '../components/ui/Skeleton'

export function BookingsPage() {
  const { selectedDatasetId } = useDatasetContext()
  const [items, setItems] = useState<BookingRequestRecord[]>([])
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const [schedulesLoadedFor, setSchedulesLoadedFor] = useState('')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setSchedules([]); setScheduleId(''); setItems([]); setLoadedKey(''); setSchedulesLoadedFor('')
    if (!selectedDatasetId) { setLoading(false); return () => controller.abort() }
    setLoading(true); setError('')
    try {
      void listSchedules(selectedDatasetId, controller.signal).then((available) => {
        if (!active) return
        setSchedules(available)
        setScheduleId(available.find((item) => item.status === 'complete')?.schedule_id ?? '')
        setSchedulesLoadedFor(selectedDatasetId)
      }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'Schedules could not be loaded'); setLoading(false) } })
    } catch (cause) { if (active) { setError(cause instanceof Error ? cause.message : 'Bookings could not be loaded'); setLoading(false) } }
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId])
  const load = useCallback(async () => {
    if (!selectedDatasetId || schedulesLoadedFor !== selectedDatasetId) return
    setLoading(true); setError('')
    try {
      invalidateApiCache(`/datasets/${selectedDatasetId}/bookings`)
      const requests = await listBookings(selectedDatasetId, scheduleId || undefined)
      setItems(requests); setLoadedKey(`${selectedDatasetId}:${scheduleId}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Bookings could not be loaded') }
    finally { setLoading(false) }
  }, [selectedDatasetId, scheduleId, schedulesLoadedFor])
  useEffect(() => { void load() }, [load])
  const run = async () => {
    if (!selectedDatasetId || !scheduleId || !window.confirm('Run deterministic booking decisions for this schedule? Existing outcomes for this schedule will be updated.')) return
    setRunning(true); setError(''); setNotice('')
    try {
      const result = await runBookingEngine(selectedDatasetId, scheduleId)
      setNotice(`Booking engine finished: ${result.counts.approved} approved, ${result.counts.rejected} rejected, ${result.counts.pending} pending.`)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Booking engine failed') }
    finally { setRunning(false) }
  }
  const counts = items.reduce((acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }), { approved: 0, rejected: 0, alternative_offered: 0, pending: 0 })
  return <div className="ops-page">
    <PageHeader eyebrow="VENUE REQUESTS" title="Bookings" description="Review submitted requests and deterministic decisions for the selected dataset." />
    <section className="ops-toolbar">
      <label className="ops-field">Schedule<select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Requests without outcomes</option>{schedules.map((s) => <option key={s.schedule_id} value={s.schedule_id}>{new Date(s.created_at).toLocaleString()} · {s.status}</option>)}</select></label>
      <button className="ops-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />Refresh</button>
      <button className="ops-button primary" onClick={() => void run()} disabled={!scheduleId || running}><Play size={14} />{running ? 'Running…' : 'Run booking decisions'}</button>
    </section>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15} />{error}</div>}
    {notice && <div className="ops-message success" role="status">{notice}</div>}
    {loading && loadedKey !== `${selectedDatasetId}:${scheduleId}` && <SkeletonPage label="Loading booking requests"><SkeletonStats count={4} /><section className="ops-card"><SkeletonTable rows={7} columns={7} /></section></SkeletonPage>}
    {loading && loadedKey === `${selectedDatasetId}:${scheduleId}` && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton" />Refreshing booking decisions…</span>}
    {!loading && !error && loadedKey === `${selectedDatasetId}:${scheduleId}` && <><div className="ops-grid">{Object.entries(counts).map(([status, count]) => <div className="ops-stat" key={status}><span>{status.replace('_', ' ')}</span><strong>{count}</strong></div>)}</div>
      {items.length === 0 ? <div className="ops-empty"><CalendarClock size={20}/><strong>No booking requests</strong><span>Requests imported with this dataset will appear here.</span></div> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Request</th><th>Requester</th><th>Priority</th><th>Attendance</th><th>Decision</th><th>Slot / room</th><th>Reason</th></tr></thead><tbody>{items.map((item) => <tr key={item.request_id}><td className="wrap-cell"><strong>{item.title}</strong><br/><span className="ops-mono">{item.request_id}</span></td><td>{item.requester}<br/>{item.role}</td><td>{item.effective_category} · {item.priority_rank}</td><td>{item.attendance}</td><td><span className={`ops-badge ${item.status === 'approved' ? 'good' : item.status === 'rejected' ? 'bad' : ''}`}>{item.cancelled ? 'cancelled' : item.status}</span></td><td>{item.day ? `${item.day} P${item.start_period}–P${item.end_period} · ${item.room_id ?? ''}` : '—'}</td><td className="wrap-cell">{item.reason ?? 'No decision recorded'}</td></tr>)}</tbody></table></div>}
    </>}
  </div>
}
