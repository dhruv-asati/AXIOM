export type AnalyticsAvailability =
  | { status: 'unavailable'; reason: string }

const unavailableReason =
  'No analytics endpoints or aggregate response schemas are documented. AXIOM cannot load authoritative operational metrics yet.'

/** Keeps the analytics integration boundary explicit; no undocumented URL is called. */
export async function loadAnalyticsAvailability(): Promise<AnalyticsAvailability> {
  return { status: 'unavailable', reason: unavailableReason }
}
