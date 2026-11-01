export type ClockPeriod = { id: number; start?: string; end?: string }
export type PeriodEdge = 'start' | 'end'

function normalizeTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return ''
  return `${String(Math.min(23, Number(match[1]))).padStart(2, '0')}:${String(Math.min(59, Number(match[2]))).padStart(2, '0')}`
}

export function periodClockTime(period?: ClockPeriod, edge: PeriodEdge = 'start') {
  const raw = period?.[edge]
  if (!raw) return ''
  const match = /(\d{1,2}):(\d{2})/.exec(raw)
  if (!match) return ''
  return normalizeTime(`${match[1]}:${match[2]}`)
}

export function periodForClockTime(periods: ClockPeriod[], value: string, edge: PeriodEdge = 'start') {
  const wanted = normalizeTime(value)
  return periods.find((period) => periodClockTime(period, edge) === wanted)
}

export function periodClockSlots(periods: ClockPeriod[], edge: PeriodEdge = 'start') {
  return [...new Set(periods.map((period) => periodClockTime(period, edge)).filter(Boolean))]
}
