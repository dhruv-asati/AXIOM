import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import { TimetableFilters, type TimetableFilterValues } from '../components/timetable/TimetableFilters'
import { SessionDetailsDialog } from '../components/timetable/SessionDetailsDialog'
import { TimetableViews } from '../components/timetable/TimetableViews'
import { PageHeader } from '../components/layout/PageHeader'
import { loadTimetable } from '../api/timetable'
import { addLocalDays, atLocalMidnight, formatDate, formatWeekRange, mondayOfWeek } from '../lib/timetableTime'
import type { TimetableSession } from '../types/timetable'

type ViewMode = 'week' | 'day'
type LoadState = 'loading' | 'preview' | 'unavailable' | 'error'

const emptyFilters: TimetableFilterValues = {
  department: '', faculty: '', room: '', course: '', group: '', search: '',
}

function matchesSearch(session: TimetableSession, query: string): boolean {
  if (!query.trim()) return true
  const searchText = [
    session.courseCode,
    session.courseName,
    session.facultyName,
    session.facultyId,
    session.roomName,
    session.roomId,
    ...session.studentGroups.flatMap((group) => [group.id, group.name]),
  ].join(' ').toLocaleLowerCase()
  return searchText.includes(query.trim().toLocaleLowerCase())
}

export function TimetablePage() {
  const [sessions, setSessions] = useState<TimetableSession[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => atLocalMidnight(new Date()))
  const [view, setView] = useState<ViewMode>(() => (
    window.matchMedia('(max-width: 760px)').matches ? 'day' : 'week'
  ))
  const [filters, setFilters] = useState<TimetableFilterValues>(emptyFilters)
  const [selectedSession, setSelectedSession] = useState<TimetableSession | null>(null)
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false)

  const loadSessions = useCallback(async () => {
    setLoadState('loading')
    setLoadError('')
    try {
      const result = await loadTimetable()
      setSessions(result.sessions)
      setLoadState(result.status)
      if (result.status === 'unavailable') setLoadError(result.reason)
    } catch {
      setSessions([])
      setLoadState('error')
      setLoadError('The timetable preview could not be loaded. Try again.')
    }
  }, [])

  useEffect(() => { void loadSessions() }, [loadSessions])

  const weekStart = useMemo(() => mondayOfWeek(selectedDate), [selectedDate])
  const filteredSessions = useMemo(() => sessions.filter((session) => (
    (!filters.department || session.department === filters.department)
    && (!filters.faculty || session.facultyId === filters.faculty)
    && (!filters.room || session.roomId === filters.room)
    && (!filters.course || session.courseCode === filters.course)
    && (!filters.group || session.studentGroups.some((group) => group.id === filters.group))
    && matchesSearch(session, filters.search)
  )), [sessions, filters])

  const hasFilters = Object.values(filters).some(Boolean)
  const conflictSessionCount = filteredSessions.filter((session) => session.conflicts?.length).length

  const updateFilter = (key: keyof TimetableFilterValues, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const moveWeek = (offset: number) => setSelectedDate((current) => addLocalDays(current, offset * 7))
  const goToToday = () => setSelectedDate(atLocalMidnight(new Date()))
  const selectDate = (date: Date) => {
    setSelectedDate(atLocalMidnight(date))
    setView('day')
  }

  return (
    <div className="timetable-page">
      <PageHeader
        className="timetable-page-header"
        eyebrow="ACADEMIC OPERATIONS"
        title="Timetable Management"
        description="View and manage academic schedules across campus."
        action={(
          <div className="timetable-header-controls">
            <div className="week-navigation" aria-label="Calendar week navigation">
              <button type="button" className="week-nav-button" onClick={() => moveWeek(-1)} aria-label="Previous week">
                <ChevronLeft size={17} />
              </button>
              <span className="week-range-label"><CalendarDays size={15} aria-hidden="true" />{formatWeekRange(weekStart)}</span>
              <button type="button" className="week-nav-button" onClick={() => moveWeek(1)} aria-label="Next week">
                <ChevronRight size={17} />
              </button>
            </div>
            <button type="button" className="today-button" onClick={goToToday}>Today</button>
            <button type="button" className="timetable-refresh-button" onClick={() => void loadSessions()} disabled={loadState === 'loading'}>
              {loadState === 'loading' ? <LoaderCircle className="is-spinning" size={15} /> : <RefreshCw size={15} />}
              <span>{loadState === 'loading' ? 'Loading' : 'Refresh'}</span>
            </button>
          </div>
        )}
      />

      {loadState === 'preview' && (
        <div className="timetable-state-banner is-preview" role="status">
          <span className="state-banner-mark">DEV</span>
          <span><strong>Development preview</strong> — sample assignments from <code>schedule.example.json</code>; this is not a real or validated timetable.</span>
        </div>
      )}
      {loadState === 'loading' && (
        <div className="timetable-state-banner is-loading" role="status" aria-live="polite">
          <LoaderCircle size={15} className="is-spinning" aria-hidden="true" /> Loading timetable data…
        </div>
      )}
      {(loadState === 'unavailable' || loadState === 'error') && (
        <div className={`timetable-state-banner is-${loadState}`} role="status">
          <AlertTriangle size={15} aria-hidden="true" />
          <span><strong>{loadState === 'error' ? 'Timetable unavailable' : 'Live timetable not connected'}</strong> — {loadError}</span>
        </div>
      )}

      <section className="timetable-toolbar" aria-label="View and filter controls">
        <div className="timetable-view-switch" role="group" aria-label="Timetable view">
          <button type="button" className={view === 'week' ? 'is-active' : ''} aria-pressed={view === 'week'} onClick={() => setView('week')}>
            <CalendarDays size={15} aria-hidden="true" /> Week
          </button>
          <button type="button" className={view === 'day' ? 'is-active' : ''} aria-pressed={view === 'day'} onClick={() => setView('day')}>
            <Clock3 size={15} aria-hidden="true" /> Day
          </button>
        </div>
        <div className="timetable-toolbar-right">
          <span className="timetable-session-count" aria-live="polite">
            {loadState === 'preview' ? `${filteredSessions.length} of ${sessions.length} preview sessions` : 'No live sessions loaded'}
          </span>
          <button
            type="button"
            className={`filter-toggle-button${isFilterPanelOpen ? ' is-active' : ''}`}
            onClick={() => setIsFilterPanelOpen((open) => !open)}
            aria-expanded={isFilterPanelOpen}
            aria-controls="timetable-filter-content"
          >
            <SlidersHorizontal size={15} aria-hidden="true" /> Filters
            {hasFilters && <span className="filter-active-dot" aria-label="Filters active" />}
          </button>
        </div>
      </section>

      {isFilterPanelOpen && (
        <div id="timetable-filter-content">
          <TimetableFilters
            sessions={sessions}
            filters={filters}
            onChange={updateFilter}
            onClear={() => setFilters(emptyFilters)}
          />
        </div>
      )}

      <section className="timetable-calendar-panel" aria-label="Timetable schedule">
        <TimetableViews
          view={view}
          state={loadState}
          sessions={filteredSessions}
          allSessionCount={sessions.length}
          weekStart={weekStart}
          selectedDate={selectedDate}
          onSelectDate={selectDate}
          onSelectSession={setSelectedSession}
          onClearFilters={() => setFilters(emptyFilters)}
        />
      </section>

      <div className="conflict-contract-note" role="note">
        <AlertTriangle size={15} aria-hidden="true" />
        <span>
          {conflictSessionCount > 0
            ? `${conflictSessionCount} session${conflictSessionCount === 1 ? '' : 's'} include solver-provided conflict details.`
            : 'Conflict indicators will appear only when supplied by the official solver or backend. The frontend does not validate schedules.'}
        </span>
      </div>

      {view === 'week' && loadState === 'preview' && (
        <p className="timetable-calendar-footnote">Viewing the recurring weekly pattern for {formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}. Calendar navigation changes the viewed date range, not the source assignment.</p>
      )}

      {selectedSession && (
        <SessionDetailsDialog
          session={selectedSession}
          weekStart={weekStart}
          onClose={() => setSelectedSession(null)}
        />
      )}

      {loadState === 'unavailable' && loadError && <span className="sr-only">{loadError}</span>}
    </div>
  )
}
