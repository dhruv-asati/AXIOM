import type { ExaminationLoadResult } from '../types/examination'

const unavailableReason =
  'No examination schedule API is documented yet. The available exam CSV contains solver inputs, not scheduled dates, times, room allocations, or conflict diagnostics.'

/** Do not read source exam definitions as if they were a solver-produced schedule. */
export async function loadExaminations(): Promise<ExaminationLoadResult> {
  return { status: 'unavailable', examinations: [], reason: unavailableReason }
}
