/** Frontend view types only; these are not the unresolved API payload schemas. */
export type RoomView = {
  id: string
  name: string
  building: string
  floor?: string | number
  type: string
  capacity?: number
  equipment?: string[]
  accessibility?: string[]
  /** Rendered only when explicitly supplied by the backend. */
  availabilityLabel?: string
  /** Rendered only when supplied by a documented related-bookings contract. */
  relatedBookings?: Array<{ id: string; label: string; dateTime: string }>
}

/** The backend owns status vocabulary and booking decisions. */
export type BookingRequestView = {
  id: string
  venue: string
  date: string
  startTime: string
  endTime: string
  requester: string
  statusLabel: string
  explanation?: string
}

export type VenueDataResult<T> =
  | { status: 'unavailable'; records: []; reason: string }
  | { status: 'ready'; records: T[] }
