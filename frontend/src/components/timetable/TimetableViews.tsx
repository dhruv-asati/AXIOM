import { AlertCircle, CalendarDays, ChevronDown, Clock3, Search } from 'lucide-react'
import { SessionCard } from './SessionCard'
import { addLocalDays, formatDate, formatSessionTime, periodGridRow, periodTimeLabel, sameLocalDate, timetableDayForDate } from '../../lib/timetableTime'
import { timetableDays, type TimetableDay, type TimetableSession } from '../../types/timetable'

type ViewState = 'loading' | 'preview' | 'unavailable' | 'error'

type TimetableViewsProps = {
  view: 'week' | 'day'
  state: ViewState
  sessions: TimetableSession[]
  allSessionCount: number
  weekStart: Date
  selectedDate: Date
  onSelectDate: (date: Date) => void
  onSelectSession: (session: TimetableSession) => void
  onClearFilters: () => void
}

const periods = Array.from({ length: 9 }, (_, index) => index + 1)

function assignLanes(daySessions: TimetableSession[]) {
  const laneEnds: number[] = []
  const laneForSession = new Map<string, number>()
  const sorted = [...daySessions].sort((a, b) => a.startPeriod - b.startPeriod || a.id.localeCompare(b.id))

  for (const session of sorted) {
    let lane = laneEnds.findIndex((endPeriod) => endPeriod < session.startPeriod)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = session.startPeriod + session.durationPeriods - 1
    laneForSession.set(session.id, lane)
  }

  return { laneForSession, laneCount: Math.max(1, laneEnds.length) }
}

function EmptyViewMessage({
  state,
  hasFilters,
  allSessionCount,
  onClearFilters,
}: Pick<TimetableViewsProps, 'state' | 'allSessionCount' | 'onClearFilters'> & { hasFilters: boolean }) {
  if (state === 'loading') {
    return <div className="timetable-grid-message is-loading" role="status"><span className="loading-ring" />Loading timetable…</div>
  }

  if (state === 'unavailable' || state === 'error') {
    return (
      <div className="timetable-grid-message" role="status">
        <AlertCircle size={19} aria-hidden="true" />
        <strong>{state === 'error' ? 'Timetable could not be loaded' : 'Timetable data unavailable'}</strong>
        <span>The retrieval route and response contract must be agreed before live sessions can be shown.</span>
      </div>
    )
  }

  if (hasFilters && allSessionCount > 0) {
    return (
      <div className="timetable-grid-message" role="status">
        <SearchEmptyIcon />
        <strong>No sessions match these filters</strong>
        <button className="inline-clear-button" type="button" onClick={onClearFilters}>Clear filters</button>
      </div>
    )
  }

  return (
    <div className="timetable-grid-message" role="status">
      <CalendarDays size={20} aria-hidden="true" />
      <strong>No timetable sessions available</strong>
      <span>Session assignments will appear here when a timetable is loaded.</span>
    </div>
  )
}

function SearchEmptyIcon() {
  return <Search size={19} aria-hidden="true" />
}

function WeekGrid({
  sessions,
  allSessionCount,
  state,
  weekStart,
  selectedDate,
  onSelectDate,
  onSelectSession,
  onClearFilters,
}: Omit<TimetableViewsProps, 'view'>) {
  const sessionsByDay = new Map<TimetableDay, TimetableSession[]>(timetableDays.map((day) => [day, []]))
  for (const session of sessions) sessionsByDay.get(session.day)?.push(session)
  const hasFilters = sessions.length !== allSessionCount

  return (
    <div className="week-calendar-scroll" role="region" aria-label="Weekly timetable, Monday to Saturday" tabIndex={0}>
      <div className="week-calendar-grid">
        <div className="week-axis-heading">PERIOD</div>
        {timetableDays.map((day, index) => {
          const date = addLocalDays(weekStart, index)
          return (
            <button
              className={`week-day-heading${sameLocalDate(date, selectedDate) ? ' is-selected' : ''}`}
              type="button"
              key={day}
              style={{ gridColumn: index + 2, gridRow: 1 }}
              onClick={() => onSelectDate(date)}
              aria-label={`Show ${formatDate(date)} in daily view`}
              title="Select day for daily view"
            >
              <span>{new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date)}</span>
              <strong>{new Intl.DateTimeFormat('en-IN', { day: 'numeric' }).format(date)}</strong>
              <ChevronDown className="day-heading-chevron" size={12} aria-hidden="true" />
            </button>
          )
        })}

        {periods.map((period) => (
          <div className="week-time-label" key={period} style={{ gridColumn: 1, gridRow: periodGridRow(period) + 1 }}>
            <strong>P{period}</strong><span>{periodTimeLabel(period)}</span>
          </div>
        ))}
        <div className="week-lunch-label" style={{ gridColumn: 1, gridRow: 7 }}>LUNCH</div>

        {timetableDays.map((day, index) => {
          const daySessions = sessionsByDay.get(day) ?? []
          const { laneForSession, laneCount } = assignLanes(daySessions)
          return (
            <div
              className={`week-day-column${sameLocalDate(addLocalDays(weekStart, index), selectedDate) ? ' is-selected' : ''}${laneCount > 1 ? ' has-overlaps' : ''}`}
              key={day}
              style={{ gridColumn: index + 2, gridRow: '2 / span 10', gridTemplateColumns: `repeat(${laneCount}, minmax(0, 1fr))` }}
            >
              {daySessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onSelect={onSelectSession}
                  compact
                  style={{
                    gridColumn: (laneForSession.get(session.id) ?? 0) + 1,
                    gridRow: `${periodGridRow(session.startPeriod)} / span ${session.durationPeriods}`,
                  }}
                />
              ))}
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div className="week-grid-message-wrap" style={{ gridColumn: '2 / -1', gridRow: '2 / span 10' }}>
            <EmptyViewMessage
              state={state}
              allSessionCount={allSessionCount}
              hasFilters={hasFilters}
              onClearFilters={onClearFilters}
            />
          </div>
        )}
      </div>
      <p className="week-grid-caption"><Clock3 size={13} aria-hidden="true" /> Period times follow the CIT starter pack timetable model. Calendar week is for viewing; the source schedule is a recurring weekly pattern.</p>
    </div>
  )
}

function DayAgenda({
  sessions,
  allSessionCount,
  state,
  selectedDate,
  onSelectSession,
  onClearFilters,
}: Omit<TimetableViewsProps, 'view' | 'weekStart' | 'onSelectDate'>) {
  const day = timetableDayForDate(selectedDate)
  const daySessions = sessions
    .filter((session) => session.day === day)
    .sort((a, b) => a.startPeriod - b.startPeriod || a.id.localeCompare(b.id))
  const hasFilters = sessions.length !== allSessionCount

  return (
    <div className="daily-agenda" aria-label={`Sessions for ${formatDate(selectedDate)}`}>
      <div className="daily-agenda-heading">
        <div><span className="section-eyebrow">DAILY SCHEDULE</span><h3>{formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h3></div>
        <span className="daily-agenda-count">{daySessions.length} {daySessions.length === 1 ? 'session' : 'sessions'}</span>
      </div>
      {daySessions.length > 0 ? (
        <div className="daily-agenda-list">
          {daySessions.map((session) => (
            <div className="daily-agenda-row" key={session.id}>
              <div className="daily-agenda-time"><Clock3 size={14} aria-hidden="true" /><span>{formatSessionTime(session)}</span></div>
              <SessionCard session={session} onSelect={onSelectSession} />
            </div>
          ))}
        </div>
      ) : (
        <div className="daily-agenda-empty">
          {sessions.length > 0 && state === 'preview'
            ? <div className="timetable-grid-message" role="status"><CalendarDays size={20} /><strong>No sessions scheduled for this day</strong><span>Select a different day or switch to the weekly view.</span></div>
            : <EmptyViewMessage
              state={state}
              allSessionCount={allSessionCount}
              hasFilters={hasFilters}
              onClearFilters={onClearFilters}
            />}
        </div>
      )}
    </div>
  )
}

export function TimetableViews(props: TimetableViewsProps) {
  return props.view === 'week'
    ? <WeekGrid {...props} />
    : <DayAgenda {...props} />
}
