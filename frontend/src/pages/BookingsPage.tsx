import { useCallback, useEffect, useState } from 'react'
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
}
