import type { BookingRequestView, RoomView, VenueDataResult } from '../types/venue'

const roomContractMissing =
  'Room inventory is not connected. Dhruv’s API contract must define the response fields before this page can load campus rooms.'
const bookingContractMissing =
  'Booking requests are not connected. Dhruv’s API contract must define the request, response, and status fields before this page can load requests.'

/**
 * These loaders intentionally make no request until API_CONTRACTS.md defines
 * the currently listed routes. In particular, the frontend does not guess a
 * response schema or treat the health endpoint as room/booking data.
 */
export async function loadRooms(): Promise<VenueDataResult<RoomView>> {
  return { status: 'unavailable', records: [], reason: roomContractMissing }
}

export async function loadBookingRequests(): Promise<VenueDataResult<BookingRequestView>> {
  return { status: 'unavailable', records: [], reason: bookingContractMissing }
}
