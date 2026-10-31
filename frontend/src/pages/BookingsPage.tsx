import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlertCircle, CalendarClock, Check, Play, RefreshCw, ShieldAlert } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { cancelBookingRequest, createBookingClassMoveProposal, decideClassMoveProposal, decideDepartmentLabBooking, listBookings, listClassMoveProposals, listDepartmentLabBookings, listRooms, listSchedules, runBookingEngine, submitBooking } from '../api/resources'
import { invalidateApiCache } from '../api/client'
import { useDatasetContext } from '../context/DatasetContext'
import type { BookingRequestRecord, RoomRecord, ScheduleSummary } from '../types/api'
import './Operations.css'
import { SkeletonPage, SkeletonStats, SkeletonTable } from '../components/ui/Skeleton'
import { useAuth } from '../auth/AuthContext'
import { getDataset } from '../api/datasets'
import type { DatasetCalendar } from '../types/api'
import { canApproveDepartmentLabs, canReviewClassMoveBookings } from '../auth/roleAccess.mjs'
import { SmoothInput } from '../components/ui/SmoothInput'

export function BookingsPage() {
  const { user } = useAuth()
  const { selectedDatasetId } = useDatasetContext()
  const [items, setItems] = useState<BookingRequestRecord[]>([])
  const [calendar, setCalendar] = useState<DatasetCalendar | null>(null)
  const [eventRoomTypes, setEventRoomTypes] = useState<string[]>([])
  const [eventRooms, setEventRooms] = useState<RoomRecord[]>([])
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [requestTitle, setRequestTitle] = useState('')
  const [attendance, setAttendance] = useState('30')
  const [duration, setDuration] = useState('1')
  const [requestDay, setRequestDay] = useState('')
  const [fromPeriod, setFromPeriod] = useState('')
  const [toPeriod, setToPeriod] = useState('')
  const [requestRoomType, setRequestRoomType] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  const [schedulesLoadedFor, setSchedulesLoadedFor] = useState('')
  const [labRequests, setLabRequests] = useState<Array<{ request_id: string; requester: string; title: string; department: string; attendance: number; duration_periods: number; windows: Array<{ day: string; from_period: number; to_period: number }>; room_types: string[]; needs: string[]; mandatory_for_groups: string[]; created_by_user_id: string | null }>>([])
  const [labRooms, setLabRooms] = useState<RoomRecord[]>([])
  const [labSelection, setLabSelection] = useState<Record<string, { room_id: string; day: string; start_period: number }>>({})
  const [classMoves, setClassMoves] = useState<Array<{ proposal_id: string; request_id: string; baseline_schedule_id: string; room_id: string; day: string; start_period: number; end_period: number; status: string; reason: string | null; explanation: string; created_by_user_id: string | null; approved_schedule_id: string | null; changed_session_ids: string[]; before: Array<{ session_id: string; day: string; start_period: number; room_id: string }>; assignments: Array<{ session_id: string; day: string; start_period: number; room_id: string }>; request: { title: string; requester: string; attendance: number } | null }>>([])
  const [moveRequestId, setMoveRequestId] = useState('')
  const [moveRoomId, setMoveRoomId] = useState('')
  const [moveDay, setMoveDay] = useState('')
  const [moveStart, setMoveStart] = useState('')
  const [approving, setApproving] = useState(false)
  const maySubmit = user?.role === 'club_representative' || user?.role === 'department_coordinator'
  const bookingDescription = user?.role === 'club_representative'
    ? 'Submit a club venue request, follow its status and cancellation eligibility, and read the reason for a rejection.'
    : user?.role === 'department_coordinator'
      ? 'Submit department event requests and review requests belonging to your department.'
      : 'Review submitted requests and deterministic decisions for the selected dataset.'
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    if (!selectedDatasetId || !maySubmit) { setCalendar(null); setEventRoomTypes([]); setEventRooms([]); return () => controller.abort() }
    Promise.all([getDataset(selectedDatasetId, controller.signal), listRooms(selectedDatasetId, {}, controller.signal)])
      .then(([dataset, rooms]) => {
        if (!active) return
        const roomTypes = [...new Set(rooms.filter((room) => room.allowed_uses.includes('event')).map((room) => room.room_type))].sort()
        setEventRooms(rooms.filter((room) => room.allowed_uses.includes('event')))
        setCalendar(dataset.calendar)
        setEventRoomTypes(roomTypes)
        setRequestDay(dataset.calendar.days.find((day) => ['MON', 'TUE', 'WED', 'THU', 'FRI'].includes(day)) ?? '')
        const periods = dataset.calendar.periods.map((period) => period.id).sort((a, b) => a - b)
        setFromPeriod(String(periods[0] ?? ''))
        setToPeriod(String(periods.at(-1) ?? ''))
        setRequestRoomType(roomTypes[0] ?? '')
      })
      .catch((cause: unknown) => { if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Booking request form unavailable') })
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId, maySubmit])
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
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setLabRequests([]); setLabRooms([]); setClassMoves([])
    if (!selectedDatasetId || !scheduleId) return () => controller.abort()
    if (user?.role === 'department_coordinator') {
      Promise.all([listDepartmentLabBookings(selectedDatasetId, scheduleId, controller.signal), listRooms(selectedDatasetId, {}, controller.signal)])
        .then(([requests, rooms]) => {
          if (!active) return
          const eligibleRooms = rooms.filter((room) => room.department === user.department && room.room_type.toLowerCase().includes('lab') && room.allowed_uses.includes('event'))
          setLabRooms(eligibleRooms)
          setLabRequests(requests)
          setLabSelection(Object.fromEntries(requests.map((request) => {
            const room = eligibleRooms.find((candidate) => request.room_types.includes(candidate.room_type))
            const window = request.windows[0]
            return [request.request_id, { room_id: room?.room_id ?? '', day: window?.day ?? '', start_period: window?.from_period ?? 1 }]
          })))
        }).catch((cause) => { if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Department lab approvals could not be loaded') })
    }
    if (user?.role === 'admin' || maySubmit) {
      listClassMoveProposals(selectedDatasetId, controller.signal)
        .then((proposals) => { if (active) setClassMoves(proposals) })
        .catch((cause) => { if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Class-move proposals could not be loaded') })
    }
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId, scheduleId, user?.role, user?.department, maySubmit])

  const updateLabChoice = (requestId: string, value: Partial<{ room_id: string; day: string; start_period: number }>) => {
    setLabSelection((current) => ({ ...current, [requestId]: { ...current[requestId], ...value } }))
  }
  const reviewLabBooking = async (requestId: string, decision: 'approve' | 'reject') => {
    if (!selectedDatasetId || !scheduleId) return
    const reason = decision === 'reject' ? window.prompt('Enter a reason for rejecting this lab booking:')?.trim() : undefined
    if (decision === 'reject' && !reason) return
    const selected = labSelection[requestId]
    setApproving(true); setError(''); setNotice('')
    try {
      const result = await decideDepartmentLabBooking(selectedDatasetId, scheduleId, requestId, decision, decision === 'approve' ? selected : { reason })
      setNotice(`${decision === 'approve' ? 'Lab booking approved' : 'Lab booking rejected'}: ${result.reason}`)
      setLabRequests((current) => current.filter((row) => row.request_id !== requestId))
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${decision} lab booking`) }
    finally { setApproving(false) }
  }
  const submitClassMove = async () => {
    if (!selectedDatasetId || !scheduleId || !moveRequestId || !moveRoomId || !moveDay || !moveStart) return
    setApproving(true); setError(''); setNotice('')
    try {
      const proposal = await createBookingClassMoveProposal(selectedDatasetId, moveRequestId, { schedule_id: scheduleId, room_id: moveRoomId, day: moveDay, start_period: Number(moveStart) })
      setNotice(`Class-move proposal created for Admin review (${proposal.proposal_id}). No schedule or booking has changed yet.`)
      setClassMoves(await listClassMoveProposals(selectedDatasetId))
      setMoveRequestId(''); setMoveRoomId(''); setMoveDay(''); setMoveStart('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Class-move proposal could not be created') }
    finally { setApproving(false) }
  }
  const reviewClassMove = async (proposalId: string, decision: 'approve' | 'reject') => {
    if (!selectedDatasetId) return
    const reason = decision === 'reject' ? window.prompt('Enter a reason for rejecting this class-move proposal:')?.trim() : undefined
    if (decision === 'reject' && !reason) return
    setApproving(true); setError(''); setNotice('')
    try {
      const result = await decideClassMoveProposal(selectedDatasetId, proposalId, decision, reason)
      setNotice(decision === 'approve' ? `Booking and class-move approved. New schedule: ${result.approved_schedule_id}` : `Proposal rejected: ${result.reason}`)
      setClassMoves((current) => current.map((row) => row.proposal_id === proposalId ? { ...row, status: decision === 'approve' ? 'approved' : 'rejected', reason: result.reason } : row))
      if (decision === 'approve' && result.approved_schedule_id) {
        const updatedSchedules = await listSchedules(selectedDatasetId)
        setSchedules(updatedSchedules)
        setScheduleId(result.approved_schedule_id)
      } else await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${decision} class move`) }
    finally { setApproving(false) }
  }
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
  const createRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedDatasetId || !user || !calendar || !requestDay || !requestRoomType) return
    const durationValue = Number(duration)
    const start = Number(fromPeriod)
    const end = Number(toPeriod)
    if (!Number.isInteger(durationValue) || durationValue < 1 || end - start + 1 < durationValue) {
      setError('The selected period window must be at least as long as the requested duration.')
      return
    }
    setRequesting(true); setError(''); setNotice('')
    const role = user.role === 'club_representative' ? 'club' : 'department_coordinator'
    const category = user.role === 'club_representative' ? 'club_event' : 'department_event'
    try {
      await submitBooking(selectedDatasetId, {
        requester: user.username, role, department: user.department,
        requested_category: category, title: requestTitle.trim(), attendance: Number(attendance),
        duration_periods: durationValue,
        windows: [{ day: requestDay, from_period: start, to_period: end }],
        room_types: [requestRoomType], needs: [], requested_room: null, mandatory_for_groups: [], series_id: null,
      }, requestTitle.trim(), `web-${crypto.randomUUID()}`)
      setNotice('Venue request submitted. It will remain pending until the booking engine runs.')
      setRequestTitle(''); setShowRequestForm(false); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Venue request could not be submitted') }
    finally { setRequesting(false) }
  }
  const cancelRequest = async (requestId: string) => {
    if (!selectedDatasetId || !window.confirm('Cancel this booking request?')) return
    setError(''); setNotice('')
    try {
      await cancelBookingRequest(selectedDatasetId, requestId, 'Cancelled by requester')
      setNotice('Booking request cancelled.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Booking request could not be cancelled') }
  }
  const counts = items.reduce((acc, item) => ({ ...acc, [item.status]: acc[item.status] + 1 }), { approved: 0, rejected: 0, alternative_offered: 0, pending: 0 })
  const moveableRequests = items.filter((item) => user && item.created_by_user_id === user.id && !item.cancelled && item.status !== 'approved')
  const selectedMoveRequest = moveableRequests.find((item) => item.request_id === moveRequestId)
  const moveRooms = selectedMoveRequest ? eventRooms.filter((room) => selectedMoveRequest.room_types.includes(room.room_type)) : []
  const moveSlots = selectedMoveRequest ? selectedMoveRequest.windows.flatMap((window) => Array.from({ length: Math.max(0, window.to_period - window.from_period - selectedMoveRequest.duration_periods + 2) }, (_, index) => ({ day: window.day, start: window.from_period + index }))) : []
  return <div className="ops-page">
    <PageHeader eyebrow="VENUE REQUESTS" title="Bookings" description={bookingDescription} />
    <section className="ops-toolbar">
      <label className="ops-field">Schedule<select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Requests without outcomes</option>{schedules.map((s) => <option key={s.schedule_id} value={s.schedule_id}>{new Date(s.created_at).toLocaleString()} · {s.status}</option>)}</select></label>
      <button className="ops-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />Refresh</button>
      {user?.role === 'admin' && <button className="ops-button primary" onClick={() => void run()} disabled={!scheduleId || running}><Play size={14} />{running ? 'Running…' : 'Run booking decisions'}</button>}
      {maySubmit && <button className="ops-button primary" onClick={() => setShowRequestForm((value) => !value)} disabled={!calendar || !eventRoomTypes.length}>{showRequestForm ? 'Close request form' : 'Submit venue request'}</button>}
    </section>
    {user && canApproveDepartmentLabs(user.role) && scheduleId && <section className="ops-card">
      <div className="ops-card-heading"><div><h2>Department lab approvals</h2><p>Review only pending requests for your department. Lab ownership is explicitly assigned in Room Management; capacity, room features, unavailability, classes, exams, approved bookings and required student groups are rechecked on approval.</p></div></div>
      {labRequests.length === 0 ? <div className="ops-empty"><ShieldAlert size={18} /><strong>No pending eligible lab bookings</strong><span>Requests appear here when their department and requested lab type match an assigned department lab.</span></div> : <div className="ops-card-grid">{labRequests.map((request) => {
        const choice = labSelection[request.request_id] ?? { room_id: '', day: request.windows[0]?.day ?? '', start_period: request.windows[0]?.from_period ?? 1 }
        const rooms = labRooms.filter((room) => request.room_types.includes(room.room_type))
        const days = [...new Set(request.windows.map((window) => window.day))]
        const windowForDay = request.windows.find((window) => window.day === choice.day)
        const starts = windowForDay ? Array.from({ length: Math.max(0, windowForDay.to_period - windowForDay.from_period - request.duration_periods + 2) }, (_, index) => windowForDay.from_period + index) : []
        const isOwn = request.created_by_user_id === user.id
        return <article className="ops-record-card" key={request.request_id}><header><h3>{request.title}</h3><span className="ops-badge">Pending</span></header><p>{request.requester} · {request.department} · attendance {request.attendance}</p><p className="ops-mono">{request.request_id}</p>{isOwn && <div className="ops-callout">You created this request, so you cannot decide it.</div>}<div className="ops-fields">
          <label className="ops-field">Department lab<select value={choice.room_id} onChange={(event) => updateLabChoice(request.request_id, { room_id: event.target.value })}><option value="">Select lab</option>{rooms.map((room) => <option key={room.room_id} value={room.room_id}>{room.name} · {room.room_id} · cap {room.capacity}</option>)}</select></label>
          <label className="ops-field">Day<select value={choice.day} onChange={(event) => { const nextDay = event.target.value; const nextWindow = request.windows.find((window) => window.day === nextDay); updateLabChoice(request.request_id, { day: nextDay, start_period: nextWindow?.from_period ?? 1 }) }}>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
          <label className="ops-field">Start period<select value={choice.start_period} onChange={(event) => updateLabChoice(request.request_id, { start_period: Number(event.target.value) })}>{starts.map((period) => <option key={period} value={period}>P{period}</option>)}</select></label>
        </div><div className="ops-button-row"><button className="ops-button primary" type="button" disabled={approving || isOwn || !choice.room_id || starts.length === 0} onClick={() => void reviewLabBooking(request.request_id, 'approve')}><Check size={14} />Approve</button><button className="ops-button danger" type="button" disabled={approving || isOwn} onClick={() => void reviewLabBooking(request.request_id, 'reject')}>Reject</button></div></article>
      })}</div>}
    </section>}
    {maySubmit && scheduleId && <section className="ops-card">
      <div className="ops-card-heading"><div><h2>Request a class move</h2><p>If a class occupies your requested room and time, AXIOM will generate a solver-backed proposal for Admin review. The current timetable remains unchanged until approval.</p></div></div>
      {moveableRequests.length === 0 ? <div className="ops-empty"><strong>No eligible requests</strong><span>Submit a booking request first. Only your own non-cancelled requests can be sent for class-move review.</span></div> : <div className="ops-fields">
        <label className="ops-field">Your booking request<select value={moveRequestId} onChange={(event) => { setMoveRequestId(event.target.value); setMoveRoomId(''); setMoveDay(''); setMoveStart('') }}><option value="">Select request</option>{moveableRequests.map((item) => <option key={item.request_id} value={item.request_id}>{item.title} · {item.request_id}</option>)}</select></label>
        <label className="ops-field">Requested event room<select value={moveRoomId} onChange={(event) => setMoveRoomId(event.target.value)}><option value="">Select room</option>{moveRooms.map((room) => <option key={room.room_id} value={room.room_id}>{room.name} · {room.room_id}</option>)}</select></label>
        <label className="ops-field">Requested time<select value={`${moveDay}|${moveStart}`} onChange={(event) => { const [day, start] = event.target.value.split('|'); setMoveDay(day); setMoveStart(start) }}><option value="|">Select a submitted window</option>{moveSlots.map((slot) => <option key={`${slot.day}-${slot.start}`} value={`${slot.day}|${slot.start}`}>{slot.day} · P{slot.start}</option>)}</select></label>
        <button className="ops-button primary" type="button" disabled={approving || !moveRequestId || !moveRoomId || !moveDay || !moveStart} onClick={() => void submitClassMove()}>{approving ? 'Generating…' : 'Generate admin proposal'}</button>
      </div>}
    </section>}
    {maySubmit && <section className="ops-card"><div className="ops-card-heading"><div><h2>My class-move proposals</h2><p>Track the Admin review status. A proposal does not reserve a room or alter the timetable before approval.</p></div></div>{classMoves.length === 0 ? <div className="ops-empty"><strong>No class-move proposals</strong><span>Requests you submit for solver review will appear here.</span></div> : <div className="ops-card-grid">{classMoves.map((proposal) => <article className="ops-record-card" key={proposal.proposal_id}><header><h3>{proposal.request?.title ?? proposal.request_id}</h3><span className={`ops-badge ${proposal.status === 'approved' ? 'good' : proposal.status === 'rejected' ? 'bad' : 'warn'}`}>{proposal.status}</span></header><p>{proposal.day} P{proposal.start_period}–P{proposal.end_period} · {proposal.room_id}</p><p>{proposal.reason ?? proposal.explanation}</p>{proposal.approved_schedule_id && <p>Approved schedule: <span className="ops-mono">{proposal.approved_schedule_id}</span></p>}</article>)}</div>}</section>}
    {user && canReviewClassMoveBookings(user.role) && <section className="ops-card">
      <div className="ops-card-heading"><div><h2>Bookings requiring class movement</h2><p>Each proposal includes the original assignments and solver-proposed assignments. Approval rechecks the current baseline and booking constraints, then creates a new schedule while preserving the original.</p></div></div>
      {classMoves.filter((proposal) => proposal.status === 'proposed').length === 0 ? <div className="ops-empty"><strong>No pending class-move proposals</strong><span>Requester-submitted proposals appear here after the solver finds a complete repair.</span></div> : <div className="ops-card-grid">{classMoves.filter((proposal) => proposal.status === 'proposed').map((proposal) => {
        const before = new Map(proposal.before.map((row) => [row.session_id, row]))
        const after = new Map(proposal.assignments.map((row) => [row.session_id, row]))
        return <article className="ops-record-card" key={proposal.proposal_id}><header><h3>{proposal.request?.title ?? proposal.request_id}</h3><span className="ops-badge warn">Pending admin approval</span></header><p>Requested by {proposal.request?.requester ?? 'unknown'} · attendance {proposal.request?.attendance ?? '—'}</p><p>Booking slot: {proposal.day} P{proposal.start_period}–P{proposal.end_period} · {proposal.room_id}</p><p>{proposal.explanation}</p><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Session</th><th>Original</th><th>Proposed</th></tr></thead><tbody>{proposal.changed_session_ids.map((sessionId) => { const old = before.get(sessionId); const next = after.get(sessionId); return <tr key={sessionId}><td className="ops-mono">{sessionId}</td><td>{old ? `${old.day} P${old.start_period} · ${old.room_id}` : 'New session'}</td><td>{next ? `${next.day} P${next.start_period} · ${next.room_id}` : 'Removed'}</td></tr> })}</tbody></table></div><p>Validation: solver found a complete hard-constraint-valid timetable. Approval will check that the baseline is still current.</p>{proposal.created_by_user_id === user.id && <div className="ops-callout">You created this request, so you cannot decide it.</div>}<div className="ops-button-row"><button className="ops-button primary" type="button" disabled={approving || proposal.created_by_user_id === user.id} onClick={() => void reviewClassMove(proposal.proposal_id, 'approve')}>Approve booking and timetable</button><button className="ops-button danger" type="button" disabled={approving || proposal.created_by_user_id === user.id} onClick={() => void reviewClassMove(proposal.proposal_id, 'reject')}>Reject</button></div></article>
      })}</div>}
    </section>}
    {maySubmit && showRequestForm && <section className="ops-card"><div className="ops-card-heading"><div><h2>New {user?.role === 'club_representative' ? 'club' : 'department'} venue request</h2><p>Requests use your authenticated role and organization. The booking engine makes deterministic decisions; submitting does not reserve a room.</p></div></div>
      {(!calendar || !eventRoomTypes.length) ? <div className="ops-empty"><strong>No event room options</strong><span>This dataset has no rooms marked for event use.</span></div> : <form className="ops-fields" onSubmit={(event) => void createRequest(event)}>
        <label className="ops-field" style={{ flexBasis: '100%' }}>Request title<SmoothInput required maxLength={500} value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} /></label>
        <label className="ops-field">Attendance<input type="number" min="1" max="100000" required value={attendance} onChange={(event) => setAttendance(event.target.value)} /></label>
        <label className="ops-field">Duration (periods)<input type="number" min="1" max="13" required value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
        <label className="ops-field">Day<select required value={requestDay} onChange={(event) => setRequestDay(event.target.value)}>{calendar.days.filter((day) => ['MON', 'TUE', 'WED', 'THU', 'FRI'].includes(day)).map((day) => <option key={day} value={day}>{day}</option>)}</select></label>
        <label className="ops-field">Window starts at<select required value={fromPeriod} onChange={(event) => setFromPeriod(event.target.value)}>{calendar.periods.map((period) => <option key={period.id} value={period.id}>Period {period.id}{period.start ? ` · ${period.start}` : ''}</option>)}</select></label>
        <label className="ops-field">Window ends at<select required value={toPeriod} onChange={(event) => setToPeriod(event.target.value)}>{calendar.periods.map((period) => <option key={period.id} value={period.id}>Period {period.id}{period.end ? ` · ${period.end}` : ''}</option>)}</select></label>
        <label className="ops-field">Room type<select required value={requestRoomType} onChange={(event) => setRequestRoomType(event.target.value)}>{eventRoomTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <button className="ops-button primary" type="submit" disabled={requesting || !requestTitle.trim()}>{requesting ? 'Submitting…' : 'Submit for review'}</button>
      </form>}
    </section>}
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15} />{error}</div>}
    {notice && <div className="ops-message success" role="status">{notice}</div>}
    {loading && loadedKey !== `${selectedDatasetId}:${scheduleId}` && <SkeletonPage label="Loading booking requests"><SkeletonStats count={4} /><section className="ops-card"><SkeletonTable rows={7} columns={7} /></section></SkeletonPage>}
    {loading && loadedKey === `${selectedDatasetId}:${scheduleId}` && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton" />Refreshing booking decisions…</span>}
    {!loading && !error && loadedKey === `${selectedDatasetId}:${scheduleId}` && <><div className="ops-grid">{Object.entries(counts).map(([status, count]) => <div className="ops-stat" key={status}><span>{status.replace('_', ' ')}</span><strong>{count}</strong></div>)}</div>
      {items.length === 0 ? <div className="ops-empty"><CalendarClock size={20}/><strong>No booking requests</strong><span>{maySubmit ? 'Submit a venue request to start tracking its status here.' : 'Requests for this dataset will appear here.'}</span></div> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Request</th><th>Requester</th><th>Priority</th><th>Attendance</th><th>Decision</th><th>Slot / room</th><th>Reason</th>{maySubmit && <th>Action</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.request_id}><td className="wrap-cell"><strong>{item.title}</strong><br/><span className="ops-mono">{item.request_id}</span></td><td>{item.requester}<br/>{item.role}</td><td>{item.effective_category} · {item.priority_rank}</td><td>{item.attendance}</td><td><span className={`ops-badge ${item.status === 'approved' ? 'good' : item.status === 'rejected' ? 'bad' : ''}`}>{item.cancelled ? 'cancelled' : item.status}</span></td><td>{item.day ? `${item.day} P${item.start_period}–P${item.end_period} · ${item.room_id ?? ''}` : '—'}</td><td className="wrap-cell">{item.reason ?? 'No decision recorded'}</td>{maySubmit && <td>{!item.cancelled && item.status !== 'approved' && <button className="ops-button danger" type="button" onClick={() => void cancelRequest(item.request_id)}>Cancel</button>}</td>}</tr>)}</tbody></table></div>}
    </>}
  </div>
}
