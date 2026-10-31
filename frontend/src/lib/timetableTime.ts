import type { TimetableDay, TimetableSession } from '../types/timetable'

export function atLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addLocalDays(date: Date, amount: number): Date {
  const result = atLocalMidnight(date)
  result.setDate(result.getDate() + amount)
  return result
}

export function mondayOfWeek(date: Date): Date {
  const result = atLocalMidnight(date)
  const weekday = result.getDay()
  result.setDate(result.getDate() + (weekday === 0 ? -6 : 1 - weekday))
  return result
}

export function timetableDayForDate(date: Date): TimetableDay | null {
  const dayByIndex: Array<TimetableDay | null> = [null, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  return dayByIndex[date.getDay()]
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions = {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
}): string {
  return new Intl.DateTimeFormat('en-IN', options).format(date)
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addLocalDays(weekStart, 5)
  const startText = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(weekStart)
  const endText = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(weekEnd)
  return `${startText} – ${endText}`
}

function periodStartMinutes(period: number): number {
  if (period <= 5) return 8 * 60 + (period - 1) * 60
  return 14 * 60 + (period - 6) * 60
}

function periodEndMinutes(period: number): number {
  return periodStartMinutes(period) + 60
}

export function formatMinutes(minutes: number): string {
  const hour24 = Math.floor(minutes / 60)
  const minute = minutes % 60
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

export function formatSessionTime(session: TimetableSession): string {
  const finalPeriod = session.startPeriod + session.durationPeriods - 1
  return `${formatMinutes(periodStartMinutes(session.startPeriod))} – ${formatMinutes(periodEndMinutes(finalPeriod))}`
}

export function periodTimeLabel(period: number): string {
  return formatMinutes(periodStartMinutes(period))
}

export function periodGridRow(period: number): number {
  return period <= 5 ? period : period + 1
}

export function sameLocalDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}
