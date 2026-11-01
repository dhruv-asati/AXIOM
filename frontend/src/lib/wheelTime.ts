export type TimeOption = string | { value: string; label?: string; disabled?: boolean }
export type TimeConstraintOptions = {
  minuteStep?: number
  minTime?: string
  maxTime?: string
  disabledSlots?: string[]
  slots?: TimeOption[]
}

export function toMinutes(value?: string | Date) {
  if (value instanceof Date) return value.getHours() * 60 + value.getMinutes()
  const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  if (!match) return 9 * 60
  return Math.min(1439, Math.max(0, Number(match[1]) * 60 + Number(match[2])))
}

export function toTimeString(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export function buildAllowedTimes({ minuteStep = 1, minTime, maxTime, disabledSlots = [], slots }: TimeConstraintOptions = {}) {
  const allowedSlots = slots ? new Set(slots.filter((slot) => typeof slot === 'string' || !slot.disabled).map((slot) => toTimeString(toMinutes(typeof slot === 'string' ? slot : slot.value)))) : null
  const disabledTimes = new Set(disabledSlots.map((slot) => toTimeString(toMinutes(slot))))
  const disabledOptions = new Set(slots?.filter((slot) => typeof slot !== 'string' && slot.disabled).map((slot) => toTimeString(toMinutes((slot as { value: string }).value))) ?? [])
  const min = minTime ? toMinutes(minTime) : 0
  const max = maxTime ? toMinutes(maxTime) : 1439
  const step = Math.max(1, minuteStep)
  const times: number[] = []
  for (let minute = 0; minute < 1440; minute += step) {
    const formatted = toTimeString(minute)
    if (minute >= min && minute <= max && !disabledTimes.has(formatted) && !disabledOptions.has(formatted) && (!allowedSlots || allowedSlots.has(formatted))) times.push(minute)
  }
  return times
}

export function nearestAllowedTime(value: number, allowed: number[]) {
  return allowed.length ? allowed.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, allowed[0]) : value
}
