import { useMemo, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Send } from 'lucide-react'
import type { RoomView } from '../../types/venue'
import { SmoothInput } from '../ui/SmoothInput'
import { SmoothTextarea } from '../ui/SmoothTextarea'

type BookingFormValues = { venue: string; date: string; startTime: string; endTime: string; purpose: string; attendance: string; requirements: string }
type BookingFormErrors = Partial<Record<keyof BookingFormValues, string>>
const initialValues: BookingFormValues = { venue: '', date: '', startTime: '', endTime: '', purpose: '', attendance: '', requirements: '' }

function localDateValue() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function isValidCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const candidate = new Date(year, month - 1, day)
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day
}

type BookingRequestFormProps = { rooms: RoomView[]; unavailable: boolean }

export function BookingRequestForm({ rooms, unavailable }: BookingRequestFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<BookingFormErrors>({})
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState<'error' | 'info'>('error')
  const roomOptions = useMemo(() => rooms.map((room) => ({ label: room.name || room.id, value: room.id, capacity: room.capacity })), [rooms])

  const update = (key: keyof BookingFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setNotice('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: BookingFormErrors = {}
    if (!values.venue.trim()) nextErrors.venue = 'Enter a requested venue.'
    if (!values.date) nextErrors.date = 'Choose a booking date.'
    else if (!isValidCalendarDate(values.date)) nextErrors.date = 'Enter a valid date.'
    else if (values.date < localDateValue()) nextErrors.date = 'Booking date cannot be in the past.'
    if (!values.startTime) nextErrors.startTime = 'Choose a start time.'
    if (!values.endTime) nextErrors.endTime = 'Choose an end time.'
    if (values.startTime && values.endTime && values.startTime >= values.endTime) nextErrors.endTime = 'End time must be after start time.'
    if (!values.purpose.trim()) nextErrors.purpose = 'Enter the event purpose.'
    const attendeeCount = Number(values.attendance)
    if (!values.attendance) nextErrors.attendance = 'Enter expected attendance.'
    else if (!Number.isInteger(attendeeCount) || attendeeCount < 1) nextErrors.attendance = 'Attendance must be a whole number greater than zero.'
    const selectedRoom = roomOptions.find((room) => room.value.toLowerCase() === values.venue.trim().toLowerCase() || room.label.toLowerCase() === values.venue.trim().toLowerCase())
    if (!nextErrors.attendance && selectedRoom?.capacity !== undefined && attendeeCount > selectedRoom.capacity) nextErrors.attendance = `Attendance exceeds this room’s capacity of ${selectedRoom.capacity}.`
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setNoticeKind('error')
      setNotice('Please correct the highlighted fields before continuing.')
      return
    }
    setNoticeKind('info')
    setNotice('Your details are valid. Submission is unavailable until the booking request contract is agreed and documented.')
  }

  const fieldClass = (key: keyof BookingFormValues) => `booking-form-field${errors[key] ? ' has-error' : ''}`

  return (
    <form className="booking-request-form" onSubmit={handleSubmit} noValidate>
      <div className="booking-form-grid">
        <label className={`${fieldClass('venue')} booking-field-wide`}><span>Requested venue <b aria-hidden="true">*</b></span><SmoothInput list="booking-venues" value={values.venue} onChange={(event) => update('venue', event.target.value)} placeholder="Room name or ID" aria-invalid={Boolean(errors.venue)} aria-describedby={errors.venue ? 'booking-venue-error' : 'booking-venue-help'} /><datalist id="booking-venues">{roomOptions.map((room) => <option key={room.value} value={room.value}>{room.label}</option>)}</datalist>{errors.venue ? <small id="booking-venue-error">{errors.venue}</small> : <small id="booking-venue-help">Venue selection is confirmed by the booking service.</small>}</label>
        <label className={fieldClass('date')}><span>Booking date <b aria-hidden="true">*</b></span><input type="date" min={localDateValue()} value={values.date} onChange={(event) => update('date', event.target.value)} aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? 'booking-date-error' : undefined} />{errors.date && <small id="booking-date-error">{errors.date}</small>}</label>
        <div className="booking-time-group"><label className={fieldClass('startTime')}><span>Start time <b aria-hidden="true">*</b></span><input type="time" value={values.startTime} onChange={(event) => update('startTime', event.target.value)} aria-invalid={Boolean(errors.startTime)} />{errors.startTime && <small>{errors.startTime}</small>}</label><label className={fieldClass('endTime')}><span>End time <b aria-hidden="true">*</b></span><input type="time" value={values.endTime} onChange={(event) => update('endTime', event.target.value)} aria-invalid={Boolean(errors.endTime)} aria-describedby={errors.endTime ? 'booking-end-error' : undefined} />{errors.endTime && <small id="booking-end-error">{errors.endTime}</small>}</label></div>
        <label className={`${fieldClass('purpose')} booking-field-wide`}><span>Event purpose <b aria-hidden="true">*</b></span><SmoothInput value={values.purpose} onChange={(event) => update('purpose', event.target.value)} placeholder="e.g. Department seminar" aria-invalid={Boolean(errors.purpose)} aria-describedby={errors.purpose ? 'booking-purpose-error' : undefined} />{errors.purpose && <small id="booking-purpose-error">{errors.purpose}</small>}</label>
        <label className={fieldClass('attendance')}><span>Expected attendance <b aria-hidden="true">*</b></span><input type="number" min="1" step="1" inputMode="numeric" value={values.attendance} onChange={(event) => update('attendance', event.target.value)} placeholder="e.g. 40" aria-invalid={Boolean(errors.attendance)} aria-describedby={errors.attendance ? 'booking-attendance-error' : undefined} />{errors.attendance && <small id="booking-attendance-error">{errors.attendance}</small>}</label>
        <label className={`${fieldClass('requirements')} booking-field-wide`}><span>Additional requirements <em>Optional</em></span><SmoothTextarea rows={3} value={values.requirements} onChange={(event) => update('requirements', event.target.value)} placeholder="Equipment or setup requirements" /></label>
      </div>
      <div className="booking-form-footer">
        <p className="booking-contract-hint"><AlertCircle size={14} />Booking availability and approval are determined by the booking service.</p>
        <button className="venue-primary-button" type="submit"><Send size={14} />Review request</button>
      </div>
      {notice && <p className={`booking-form-notice is-${noticeKind}`} role="status">{noticeKind === 'info' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}{notice}</p>}
      {unavailable && <p className="booking-form-disabled-note">The request can be validated here, but cannot be submitted while the booking API contract is incomplete.</p>}
    </form>
  )
}
