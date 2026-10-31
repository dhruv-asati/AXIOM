import type { TimetableLoadResult } from '../types/timetable'

const unavailableReason =
  'The documented timetable retrieval route has no agreed response schema or selected timetable ID yet.'

/**
 * Uses an explicitly labelled preview only during Vite development. Production
 * remains unavailable until API_CONTRACTS.md defines a retrievable timetable.
 */
export async function loadTimetable(): Promise<TimetableLoadResult> {
  if (import.meta.env.DEV) {
    const { timetablePreview } = await import('../dev/timetablePreview')
    return { status: 'preview', sessions: timetablePreview }
  }

  return { status: 'unavailable', sessions: [], reason: unavailableReason }
}

