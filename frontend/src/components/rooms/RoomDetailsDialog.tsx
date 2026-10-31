import { Accessibility, Armchair, Building2, CalendarDays, DoorOpen, MapPin, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { RoomView } from '../../types/venue'

type RoomDetailsDialogProps = { room: RoomView; onClose: () => void }

export function RoomDetailsDialog({ room, onClose }: RoomDetailsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [onClose])

  return (
    <div className="venue-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="venue-details-dialog" role="dialog" aria-modal="true" aria-labelledby="room-detail-title" tabIndex={-1}>
        <header className="venue-dialog-header">
          <span className="venue-dialog-eyebrow">ROOM DETAILS</span>
          <button className="venue-dialog-close" type="button" onClick={onClose} aria-label="Close room details"><X size={17} /></button>
        </header>
        <div className="venue-dialog-title">
          <span className="room-card-symbol room-type-classroom"><DoorOpen size={19} /></span>
          <div><h2 id="room-detail-title">{room.name || room.id}</h2><p>{room.id}</p></div>
        </div>
        <dl className="venue-detail-list">
          <div><dt><Building2 size={14} />Building and floor</dt><dd>{room.building}{room.floor !== undefined ? ` · Floor ${room.floor}` : ' · Floor not provided'}</dd></div>
          <div><dt><DoorOpen size={14} />Room type</dt><dd>{room.type}</dd></div>
          <div><dt><Armchair size={14} />Seating capacity</dt><dd>{room.capacity !== undefined ? `${room.capacity} seats` : 'Not provided'}</dd></div>
          <div><dt><MapPin size={14} />Availability</dt><dd>{room.availabilityLabel ?? 'Not confirmed by the backend'}</dd></div>
          <div><dt>Equipment</dt><dd>{room.equipment?.length ? room.equipment.join(', ') : 'Not provided'}</dd></div>
          <div><dt><Accessibility size={14} />Accessibility</dt><dd>{room.accessibility?.length ? room.accessibility.join(', ') : 'Not provided'}</dd></div>
        </dl>
        <section className="related-bookings-block">
          <h3><CalendarDays size={15} />Related bookings</h3>
          {room.relatedBookings?.length ? <ul>{room.relatedBookings.map((booking) => <li key={booking.id}><strong>{booking.label}</strong><span>{booking.dateTime}</span></li>)}</ul> : <p>Related booking information is not available.</p>}
        </section>
      </section>
    </div>
  )
}
