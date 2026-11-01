import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Clock3, LoaderCircle, MapPin, Play, RefreshCw, Users } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { SessionDetailsDialog } from '../components/timetable/SessionDetailsDialog'
import { useDatasetContext } from '../context/DatasetContext'
import { getDataset } from '../api/datasets'
import { invalidateApiCache } from '../api/client'
import { generateTimetable, getAssignments, listSchedules } from '../api/resources'
import type { DatasetCalendar, ScheduleSummary, TimetableAssignment } from '../types/api'
import type { TimetableSession } from '../types/timetable'
import { addLocalDays, mondayOfWeek, formatDate, formatWeekRange, sameLocalDate } from '../lib/timetableTime'
import './Operations.css'
import { SkeletonPage, SkeletonStats, SkeletonTable, SkeletonTimetable } from '../components/ui/Skeleton'
import { useAuth } from '../auth/AuthContext'

const sessionToneCount = 6

function courseTone(courseCode: string) {
  let hash = 0
  for (const character of courseCode) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return Math.abs(hash) % sessionToneCount
}

function sessionKindLabel(kind: TimetableSession['kind']) {
  return kind === 'lab' ? 'Laboratory' : kind === 'tutorial' ? 'Tutorial' : kind === 'lecture' ? 'Lecture' : 'Session'
}

type TimetableGridRow = { kind: 'period'; id: number; start?: string; end?: string; teaching?: boolean } | { kind: 'lunch' }

function toDisplaySession(row: TimetableAssignment, calendar: DatasetCalendar): TimetableSession {
  const start = calendar.periods.find((period) => period.id === row.start_period)?.start
  const end = calendar.periods.find((period) => period.id === row.end_period)?.end
  const timeLabel = start && end ? `${start}–${end}` : `P${row.start_period}–P${row.end_period}`
  return {
    id: row.session_id, day: row.day, startPeriod: row.start_period, endPeriod: row.end_period, durationPeriods: row.duration,
    courseCode: row.course_id, courseName: row.course_name, department: row.department,
    facultyId: row.faculty_id, facultyName: row.faculty_name, roomId: row.room_id,
    roomName: row.room_name, studentGroups: row.student_groups, kind: row.kind as TimetableSession['kind'], timeLabel,
  }
}

export function TimetablePage() {
  const { user } = useAuth()
  const { selectedDatasetId, selectedDataset } = useDatasetContext()
  const timetableDescription = user?.role === 'faculty'
    ? 'Your own weekly assignments and schedule-change requests, filtered to the signed-in faculty account.'
    : user?.role === 'department_coordinator'
      ? 'Your department timetable and schedule-change workspace.'
      : 'Generate and inspect persisted CP-SAT schedules. Weekly assignments are a recurring pattern, not dated attendance.'
  const [calendar, setCalendar] = useState<DatasetCalendar | null>(null)
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [assignments, setAssignments] = useState<TimetableAssignment[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [generationMessage, setGenerationMessage] = useState('')
  const [selected, setSelected] = useState<TimetableSession | null>(null)
  const [filters, setFilters] = useState({ day: '', faculty_id: '', room_id: '', course_id: '', group_id: '' })
  const [useWarmStart, setUseWarmStart] = useState(true)
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek(new Date()))
  const [loadedDatasetId, setLoadedDatasetId] = useState('')
  const loadController = useRef<AbortController | null>(null)

  const load = useCallback(async (preferredScheduleId?: string, force = false) => {
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    if (!selectedDatasetId) { setCalendar(null); setSchedules([]); setAssignments([]); setScheduleId(''); setLoadedDatasetId(''); setLoading(false); return }
    setLoading(true)
    setError('')
    if (force) invalidateApiCache(`/datasets/${selectedDatasetId}/schedules`)
    try {
      const [dataset, nextSchedules] = await Promise.all([getDataset(selectedDatasetId, controller.signal), listSchedules(selectedDatasetId, controller.signal)])
      if (controller.signal.aborted) return
      const nextId = preferredScheduleId && nextSchedules.some((item) => item.schedule_id === preferredScheduleId)
        ? preferredScheduleId
        : nextSchedules.find((item) => item.status === 'complete')?.schedule_id ?? nextSchedules[0]?.schedule_id ?? ''
      if (nextId) {
        const result = await getAssignments(selectedDatasetId, nextId, {}, controller.signal)
        if (controller.signal.aborted) return
        setCalendar(dataset.calendar)
        setSchedules(nextSchedules)
        setScheduleId(nextId)
        setAssignments(result.assignments)
        if (result.status !== 'complete') setError(`Schedule is incomplete (${result.assignments.length} assignments).`)
      } else {
        setCalendar(dataset.calendar)
        setSchedules(nextSchedules)
        setScheduleId('')
        setAssignments([])
      }
      setLoadedDatasetId(selectedDatasetId)
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Could not load schedules')
      setSchedules([])
      setAssignments([])
      setLoadedDatasetId(selectedDatasetId)
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }, [selectedDatasetId])

  useEffect(() => {
    setCalendar(null); setSchedules([]); setAssignments([]); setScheduleId(''); setLoadedDatasetId('')
    void load()
    return () => loadController.current?.abort()
  }, [load])
  useEffect(() => { setFilters({ day: '', faculty_id: '', room_id: '', course_id: '', group_id: '' }) }, [selectedDatasetId])

  const runGeneration = async () => {
    if (!selectedDatasetId || generating) return
    setGenerating(true)
    setError('')
    setGenerationMessage('CP-SAT is solving. The API does not report intermediate progress.')
    try {
      const result = await generateTimetable(selectedDatasetId, useWarmStart && scheduleId ? scheduleId : undefined)
      setGenerationMessage(`${result.status.toUpperCase()} · ${result.scheduled_sessions} sessions · ${result.scheduled_exams} exams · soft ${result.soft_total} + exam ${result.exam_soft_penalty} · ${result.solve_time_seconds.toFixed(1)}s`)
      await load(result.schedule_id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Timetable generation failed')
      setGenerationMessage('')
    } finally { setGenerating(false) }
  }

  const displaySessions = useMemo(() => {
    if (!calendar) return []
    const dayIndex = new Map((calendar.days ?? []).map((day, index) => [day, index]))
    return assignments
      .filter((row) => (!filters.day || row.day === filters.day)
        && (!filters.faculty_id || row.faculty_id === filters.faculty_id)
        && (!filters.room_id || row.room_id === filters.room_id)
        && (!filters.course_id || row.course_id === filters.course_id)
        && (!filters.group_id || row.student_groups.some((group) => group.id === filters.group_id)))
      .sort((a, b) => (dayIndex.get(a.day) ?? 99) - (dayIndex.get(b.day) ?? 99) || a.start_period - b.start_period || a.session_id.localeCompare(b.session_id))
      .map((row) => toDisplaySession(row, calendar))
  }, [assignments, calendar, filters])
  const groupOptions = useMemo(() => {
    const groups = new Map<string, string>()
    assignments.forEach((row) => row.student_groups.forEach((group) => groups.set(group.id, group.name || group.id)))
    return [...groups.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [assignments])

  const periods = (calendar?.periods ?? []).slice().sort((a, b) => a.id - b.id)
  const days = calendar?.days ?? []
  const lunchAfter = calendar?.lunch?.after_period
  const today = new Date()
  const todayIndex = days.findIndex((_, index) => sameLocalDate(addLocalDays(weekStart, index), today))
  const todayDay = todayIndex >= 0 ? days[todayIndex] : undefined
  const weekRange = days.length
    ? `${formatDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatDate(addLocalDays(weekStart, days.length - 1), { day: 'numeric', month: 'short', year: 'numeric' })}`
    : formatWeekRange(weekStart)
  const lunchStart = periods.find((period) => period.id === lunchAfter)?.end
  const lunchEnd = periods.find((period) => period.id > (lunchAfter ?? Number.POSITIVE_INFINITY))?.start
  const lunchTime = lunchStart && lunchEnd ? `${lunchStart}–${lunchEnd}` : ''
  const gridRows = useMemo<TimetableGridRow[]>(() => periods.flatMap((period, index) => {
    const rows: TimetableGridRow[] = [{ kind: 'period', ...period }]
    if (lunchAfter === period.id && index < periods.length - 1) rows.push({ kind: 'lunch' })
    return rows
  }), [lunchAfter, periods])
  const gridRowByPeriod = useMemo(() => new Map(gridRows.flatMap((row, index) => row.kind === 'period' ? [[row.id, index + 1] as const] : [])), [gridRows])
  const dayLayouts = useMemo(() => new Map(days.map((day) => {
    const ordered = displaySessions.filter((session) => session.day === day)
      .slice().sort((a, b) => a.startPeriod - b.startPeriod || a.id.localeCompare(b.id))
    const laneEnds: number[] = []
    const sessions = ordered.flatMap((session) => {
      const startPeriod = session.startPeriod
      const endPeriod = session.endPeriod ?? startPeriod + session.durationPeriods - 1
      const startRow = gridRowByPeriod.get(startPeriod)
      const endRow = gridRowByPeriod.get(endPeriod)
      if (!startRow || !endRow) return []
      let lane = laneEnds.findIndex((lastPeriod) => lastPeriod < startPeriod)
      if (lane < 0) lane = laneEnds.length
      laneEnds[lane] = endPeriod
      return [{ session, lane, startRow, rowSpan: endRow - startRow + 1 }]
    })
    return [day, { sessions, laneCount: Math.max(1, laneEnds.length) }] as const
  })), [days, displaySessions, gridRowByPeriod])
  const gridTemplateRows = gridRows.map((row) => row.kind === 'lunch' ? '38px' : 'minmax(112px, 112px)').join(' ')
  const dayColumnWidths = days.map((day) => Math.max(240, (dayLayouts.get(day)?.laneCount ?? 1) * 132))
  const dayColumnsTemplate = dayColumnWidths.map((width) => `minmax(${width}px, ${width}fr)`).join(' ')
  const gridStyle = { gridTemplateColumns: `82px ${dayColumnsTemplate}`, minWidth: `${82 + dayColumnWidths.reduce((total, width) => total + width, 0)}px` } as CSSProperties
  const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
  const moveWeek = (amount: number) => setWeekStart((current) => addLocalDays(current, amount * 7))
  const returnToCurrentWeek = () => setWeekStart(mondayOfWeek(new Date()))

  return <div className="ops-page timetable-page">
    <PageHeader eyebrow="ACADEMIC SCHEDULING" title="Weekly Timetable" description={timetableDescription} action={
      <div className="academic-week-controls" aria-label="Academic week navigation">
        <div className="academic-week-navigation">
          <button type="button" aria-label="Previous week" title="Previous week" onClick={() => moveWeek(-1)}><ChevronLeft size={15} /></button>
          <span><CalendarDays size={14} aria-hidden="true" />{weekRange}</span>
          <button type="button" aria-label="Next week" title="Next week" onClick={() => moveWeek(1)}><ChevronRight size={15} /></button>
        </div>
        <button className="academic-today-button" type="button" onClick={returnToCurrentWeek}>Today</button>
      </div>
    } />
    <section className="ops-toolbar">
      <label className="ops-field">Persisted schedule
        <select value={scheduleId} disabled={!schedules.length || loading} onChange={async (event) => {
          const nextId = event.target.value
          setScheduleId(nextId)
          if (!selectedDatasetId || !nextId) return
          setLoading(true); setError('')
          try { setAssignments((await getAssignments(selectedDatasetId, nextId)).assignments) }
          catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load assignments'); setAssignments([]) }
          finally { setLoading(false) }
        }}>
          {schedules.length === 0 && <option value="">No schedules</option>}
          {schedules.map((schedule) => <option key={schedule.schedule_id} value={schedule.schedule_id}>{new Date(schedule.created_at).toLocaleString()} · {schedule.status} · {schedule.assignment_count} sessions</option>)}
        </select>
      </label>
      {user?.role === 'admin' && <label className="ops-check-row"><input type="checkbox" checked={useWarmStart} onChange={(event) => setUseWarmStart(event.target.checked)} />Use selected complete schedule as a warm start</label>}
      {user?.role === 'admin' && <button className="ops-button primary" type="button" disabled={!selectedDatasetId || generating} onClick={() => void runGeneration()}>
        {generating ? <LoaderCircle size={14} className="is-spinning" /> : <Play size={14} />}{generating ? 'Solving…' : 'Generate timetable'}
      </button>}
      <button className="ops-button" type="button" disabled={loading || !selectedDatasetId} onClick={() => void load(scheduleId, true)}>{loading ? <LoaderCircle size={14} className="is-spinning" /> : <RefreshCw size={14} />}Refresh</button>
    </section>
    {generationMessage && <div className="ops-message" role="status">{generationMessage}</div>}
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15} />{error}<button className="ops-button" type="button" onClick={() => void load(scheduleId, true)}>Retry</button></div>}
    {!selectedDatasetId && <div className="ops-empty"><CalendarDays size={20} /><strong>Select a dataset</strong><span>Import and choose a dataset before generating or viewing a timetable.</span></div>}
    {selectedDatasetId && !loading && schedules.length === 0 && <div className="ops-empty"><CalendarDays size={20} /><strong>No persisted schedules</strong><span>Generate a schedule using the backend CP-SAT solver. No sample timetable is substituted.</span></div>}
    {loading && selectedDatasetId && loadedDatasetId !== selectedDatasetId && <SkeletonPage label="Loading timetable"><SkeletonStats count={3} /><section className="ops-card"><SkeletonTimetable /></section><section className="ops-card"><SkeletonTable rows={8} columns={6} /></section></SkeletonPage>}
    {loadedDatasetId === selectedDatasetId && scheduleId && <>
      <section className="ops-toolbar" aria-label="Timetable filters">
        <label className="ops-field">Day<select value={filters.day} onChange={(event) => setFilters((state) => ({ ...state, day: event.target.value }))}><option value="">All days</option>{days.map((day) => <option key={day}>{day}</option>)}</select></label>
        <label className="ops-field">Faculty<select value={filters.faculty_id} onChange={(event) => setFilters((state) => ({ ...state, faculty_id: event.target.value }))}><option value="">All faculty</option>{unique(assignments.map((row) => row.faculty_id)).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="ops-field">Room<select value={filters.room_id} onChange={(event) => setFilters((state) => ({ ...state, room_id: event.target.value }))}><option value="">All rooms</option>{unique(assignments.map((row) => row.room_id)).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="ops-field">Course<select value={filters.course_id} onChange={(event) => setFilters((state) => ({ ...state, course_id: event.target.value }))}><option value="">All courses</option>{unique(assignments.map((row) => row.course_id)).map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="ops-field">Student group<select value={filters.group_id} onChange={(event) => setFilters((state) => ({ ...state, group_id: event.target.value }))}><option value="">All groups</option>{groupOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <span className="ops-badge">{displaySessions.length} of {assignments.length} sessions</span>
      </section>
      {calendar && <section className="ops-card academic-timetable-card">
        <div className="ops-card-heading academic-grid-heading"><div><h2>Weekly schedule</h2><p>{selectedDataset?.source_dataset_id ?? 'Selected dataset'} · Recurring campus timetable · {weekRange}</p><p className="academic-color-key">Each row is one period. Cards across a row are parallel classes for separate groups and rooms. Use the Student group filter to follow one cohort; select a card for full details.</p></div><span className="ops-badge good">{schedules.find((row) => row.schedule_id === scheduleId)?.status ?? 'unknown'}</span></div>
        {assignments.length === 0 ? <div className="ops-empty"><CalendarDays size={18} /><strong>This schedule has no assignments</strong><span>No timetable rows were returned by the backend.</span></div> : <div className="academic-grid-scroll" role="region" aria-label="Weekly timetable grid. Scroll to see every day and period." tabIndex={0}><div className="academic-week-grid" style={gridStyle}>
          <div className="academic-time-heading">PERIOD <span>TIME</span></div>
          <div className="academic-day-headings" style={{ gridTemplateColumns: dayColumnsTemplate }}>
            {days.map((day, index) => {
              const date = addLocalDays(weekStart, index)
              return <div className={`academic-day-heading${day === todayDay ? ' is-today' : ''}`} key={day}>
                <span>{new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(date)}</span><strong>{new Intl.DateTimeFormat('en-IN', { day: '2-digit' }).format(date)}</strong><small>{new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date)}</small>{day === todayDay && <em>Today</em>}
              </div>
            })}
          </div>
          <div className="academic-period-axis" style={{ gridTemplateRows: gridTemplateRows }}>
            {gridRows.map((row, index) => row.kind === 'lunch' ? <div className="academic-lunch-axis" key="lunch" style={{ gridRow: index + 1 }}><strong>LUNCH BREAK</strong><span>{lunchTime || 'CAMPUS INTERVAL'}</span></div> : <div className="academic-period-label" key={row.id} style={{ gridRow: index + 1 }}><strong>P{row.id}</strong><span>{row.start ?? ''}{row.end ? `–${row.end}` : ''}</span>{row.teaching === false && <small>EVENT</small>}</div>)}
          </div>
          <div className="academic-day-columns" style={{ gridTemplateColumns: dayColumnsTemplate }}>
            {days.map((day) => {
              const layout = dayLayouts.get(day) ?? { sessions: [], laneCount: 1 }
              return <div className={`academic-day-track${day === todayDay ? ' is-today' : ''}`} key={day} aria-label={`${day} schedule`} data-lanes={layout.laneCount} style={{ gridTemplateRows, gridTemplateColumns: `repeat(${layout.laneCount}, minmax(0, 1fr))` }}>
                {gridRows.map((row, index) => row.kind === 'lunch'
                  ? <div className="academic-lunch-band" key={`${day}-lunch`} style={{ gridRow: index + 1 }} aria-label={`${day} lunch break`}><span>LUNCH BREAK</span></div>
                  : <div className={`academic-period-band${index % 2 ? ' is-alternate' : ''}`} key={`${day}-period-${row.id}`} style={{ gridRow: index + 1 }} aria-hidden="true" />)}
                {layout.sessions.map(({ session, lane, startRow, rowSpan }) => <button
                  type="button"
                  key={session.id}
                  className={`academic-session-block kind-${session.kind}`}
                  data-tone={courseTone(session.courseCode)}
                  style={{ gridRow: `${startRow} / span ${rowSpan}`, gridColumn: lane + 1 }}
                  aria-label={`${session.courseName}, ${session.courseCode}, ${sessionKindLabel(session.kind)}, ${session.facultyName}, ${session.roomName}, ${session.timeLabel}, ${session.studentGroups.map((group) => group.name || group.id).join(', ')}`}
                  title={`${session.courseName} · ${session.day} ${session.timeLabel} · Groups: ${session.studentGroups.map((group) => group.name || group.id).join(', ') || 'Unassigned'} · ${session.roomName}`}
                  onClick={() => setSelected(session)}
                >
                  <span className="academic-session-identifiers"><span className="academic-session-type">{sessionKindLabel(session.kind)}</span><span className="academic-session-code">{session.courseCode}</span></span>
                  <strong className="academic-session-course">{session.courseName || session.courseCode}</strong>
                  <span className="academic-session-meta"><Users size={11} aria-hidden="true" />{session.facultyName}<MapPin size={11} aria-hidden="true" />{session.roomName}</span>
                  <span className="academic-session-groups"><b>GROUP</b><span>{session.studentGroups.map((group) => group.name || group.id).join(' · ') || 'Unassigned'}</span></span>
                </button>)}
              </div>
            })}
          </div>
        </div></div>}
      </section>}
      <section className="ops-card"><div className="ops-card-heading"><div><h2>Assignments</h2><p>Course, faculty, room, period, type and student groups from the selected persisted schedule.</p><span className="assignments-scroll-hint">Swipe the table sideways to view all columns.</span></div></div>
        {displaySessions.length === 0 ? <div className="ops-empty"><Clock3 size={18} /><strong>No assignments match</strong><span>Change or clear the timetable filters.</span></div> : <div className="ops-table-wrap assignments-table-scroll" role="region" aria-label="Timetable assignments; scroll horizontally to view all columns" tabIndex={0}><table className="ops-table assignments-table"><thead><tr><th>Course</th><th>Type</th><th>Faculty</th><th>Groups</th><th>Day / periods</th><th>Room</th></tr></thead><tbody>{displaySessions.map((session) => <tr key={session.id} onClick={() => setSelected(session)} style={{ cursor: 'pointer' }}><td>{session.courseCode} · {session.courseName}</td><td>{session.kind}</td><td>{session.facultyName}</td><td className="wrap-cell">{session.studentGroups.map((group) => group.name).join(', ')}</td><td>{session.day} · {session.timeLabel}</td><td>{session.roomName} · {session.roomId}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
    {selected && <SessionDetailsDialog session={selected} weekStart={weekStart} onClose={() => setSelected(null)} />}
  </div>
}
