import { useCallback, useEffect, useState } from 'react'
<<<<<<< HEAD
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
=======
import { AlertTriangle, CalendarDays, ClipboardList, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { BookingRequestForm } from '../components/bookings/BookingRequestForm'
import { loadBookingRequests, loadRooms } from '../api/venueManagement'
import type { BookingRequestView, RoomView } from '../types/venue'

export function BookingsPage() {
  const [requests, setRequests] = useState<BookingRequestView[]>([])
  const [rooms, setRooms] = useState<RoomView[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [reason, setReason] = useState('')

  const refresh = useCallback(async () => {
    setState('loading')
    try {
      const [bookingResult, roomResult] = await Promise.all([loadBookingRequests(), loadRooms()])
      setRequests(bookingResult.records)
      setRooms(roomResult.records)
      setState(bookingResult.status)
      setReason(bookingResult.status === 'unavailable' ? bookingResult.reason : '')
    } catch {
      setRequests([])
      setRooms([])
      setState('error')
      setReason('Booking requests could not be loaded. Check the connection and try again.')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div className="venue-page bookings-page">
      <PageHeader
        eyebrow="VENUE BOOKINGS"
        title="Bookings"
        description="Request campus venues and track booking decisions."
        action={<button type="button" className="venue-refresh-button" onClick={() => void refresh()} disabled={state === 'loading'}><RefreshCw size={15} className={state === 'loading' ? 'venue-spinning' : ''} />Refresh</button>}
      />

      <div className="booking-workspace-grid">
        <section className="booking-form-panel" aria-labelledby="booking-form-heading">
          <div className="venue-panel-heading"><div><span className="venue-panel-icon"><CalendarDays size={16} /></span><div><p className="venue-eyebrow">NEW REQUEST</p><h2 id="booking-form-heading">Request a venue</h2></div></div><span className="required-field-note"><b>*</b> Required</span></div>
          <p className="venue-panel-description">Share the event details. Availability and approval are confirmed by campus operations.</p>
          <BookingRequestForm rooms={rooms} unavailable={state !== 'ready'} />
        </section>

        <section className="booking-requests-panel" aria-labelledby="booking-requests-heading">
          <div className="venue-panel-heading"><div><span className="venue-panel-icon"><ClipboardList size={16} /></span><div><p className="venue-eyebrow">REQUEST ACTIVITY</p><h2 id="booking-requests-heading">Booking requests</h2></div></div><button className="venue-icon-refresh" type="button" onClick={() => void refresh()} aria-label="Refresh booking requests" disabled={state === 'loading'}><RefreshCw size={15} /></button></div>
          {state === 'loading' ? <div className="booking-table-skeleton" role="status" aria-label="Loading booking requests"><i /><i /><i /></div> : state === 'unavailable' || state === 'error' ? (
            <div className="booking-unavailable-state" role="status"><AlertTriangle size={18} /><strong>{state === 'error' ? 'Request tracking could not be loaded' : 'Request tracking is unavailable'}</strong><p>{reason}</p></div>
          ) : requests.length ? (
            <div className="booking-table-scroll"><table className="booking-requests-table"><thead><tr><th>Request</th><th>Venue</th><th>Date &amp; time</th><th>Requester</th><th>Status</th></tr></thead><tbody>{requests.map((request) => <tr key={request.id}><td><strong>{request.id}</strong>{request.explanation && <small>{request.explanation}</small>}</td><td>{request.venue}</td><td>{request.date}<small>{request.startTime}–{request.endTime}</small></td><td>{request.requester}</td><td><span className="booking-backend-status">{request.statusLabel}</span></td></tr>)}</tbody></table></div>
          ) : <div className="booking-empty-state" role="status"><ClipboardList size={22} /><strong>No booking requests</strong><p>Requests will appear here when they are available from the booking service.</p></div>}
          {state !== 'ready' && <p className="booking-status-note">Only booking statuses and explanations supplied by the backend will be displayed.</p>}
        </section>
      </div>
    </div>
  )
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08
}
