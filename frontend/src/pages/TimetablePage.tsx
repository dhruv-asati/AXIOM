import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AlertCircle, CalendarDays, Clock3, LoaderCircle, Play, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { SessionDetailsDialog } from '../components/timetable/SessionDetailsDialog'
import { useDatasetContext } from '../context/DatasetContext'
import { getDataset } from '../api/datasets'
import { invalidateApiCache } from '../api/client'
import { generateTimetable, getAssignments, listSchedules } from '../api/resources'
import type { DatasetCalendar, ScheduleSummary, TimetableAssignment } from '../types/api'
import type { TimetableSession } from '../types/timetable'
import { mondayOfWeek, formatDate } from '../lib/timetableTime'
import './Operations.css'
import { SkeletonPage, SkeletonStats, SkeletonTable, SkeletonTimetable } from '../components/ui/Skeleton'

function toDisplaySession(row: TimetableAssignment, calendar: DatasetCalendar): TimetableSession {
  const start = calendar.periods.find((period) => period.id === row.start_period)?.start
  const end = calendar.periods.find((period) => period.id === row.end_period)?.end
  const timeLabel = start && end ? `${start}–${end}` : `P${row.start_period}–P${row.end_period}`
  return {
    id: row.session_id, day: row.day, startPeriod: row.start_period, durationPeriods: row.duration,
    courseCode: row.course_id, courseName: row.course_name, department: row.department,
    facultyId: row.faculty_id, facultyName: row.faculty_name, roomId: row.room_id,
    roomName: row.room_name, studentGroups: row.student_groups, kind: row.kind as TimetableSession['kind'], timeLabel,
  }
}

export function TimetablePage() {
  const { selectedDatasetId } = useDatasetContext()
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

  const periods = (calendar?.periods ?? []).filter((period) => period.teaching).sort((a, b) => a.id - b.id)
  const days = calendar?.days ?? []
  const lunchAfter = calendar?.lunch?.after_period
  const selectedWeekStart = mondayOfWeek(new Date())
  const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
  const sessionsForCell = (day: string, period: number) => displaySessions.filter((session) => session.day === day && session.startPeriod === period)

  return <div className="ops-page">
    <PageHeader eyebrow="ACADEMIC OPERATIONS" title="Timetable" description="Generate and inspect persisted CP-SAT schedules. Weekly assignments are a recurring pattern, not dated attendance." />
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
      <label className="ops-check-row"><input type="checkbox" checked={useWarmStart} onChange={(event) => setUseWarmStart(event.target.checked)} />Use selected complete schedule as a warm start</label>
      <button className="ops-button primary" type="button" disabled={!selectedDatasetId || generating} onClick={() => void runGeneration()}>
        {generating ? <LoaderCircle size={14} className="is-spinning" /> : <Play size={14} />}{generating ? 'Solving…' : 'Generate timetable'}
      </button>
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
        <label className="ops-field">Student group<select value={filters.group_id} onChange={(event) => setFilters((state) => ({ ...state, group_id: event.target.value }))}><option value="">All groups</option>{unique(assignments.flatMap((row) => row.student_groups.map((group) => group.id))).map((value) => <option key={value}>{value}</option>)}</select></label>
        <span className="ops-badge">{displaySessions.length} of {assignments.length} sessions</span>
      </section>
      {calendar && <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Weekly timetable grid</h2><p>Viewing a recurring teaching week as of {formatDate(selectedWeekStart, { weekday: 'long', day: 'numeric', month: 'long' })}. Filtered to persisted assignments.</p></div><span className="ops-badge good">{schedules.find((row) => row.schedule_id === scheduleId)?.status ?? 'unknown'}</span></div>
        {assignments.length === 0 ? <div className="ops-empty"><CalendarDays size={18} /><strong>This schedule has no assignments</strong><span>No timetable rows were returned by the backend.</span></div> : <div className="ops-calendar-scroll"><div className="ops-calendar-grid" style={{ '--day-count': days.length } as CSSProperties}>
          <div className="ops-calendar-cell heading">PERIOD</div>{days.map((day) => <div className="ops-calendar-cell heading" key={day}>{day}</div>)}
          {periods.map((period, index) => <div key={`p${period.id}`} style={{ display: 'contents' }}>
            {index > 0 && lunchAfter === periods[index - 1]?.id && <><div className="ops-calendar-cell period">LUNCH</div>{days.map((day) => <div className="ops-calendar-cell" key={`${day}-lunch`} aria-label={`${day} lunch break`} />)}</>}
            <div className="ops-calendar-cell period">P{period.id}<br /><span>{period.start ?? ''}</span></div>
            {days.map((day) => <div className="ops-calendar-cell" key={`${day}-${period.id}`}>{sessionsForCell(day, period.id).map((session) => <button type="button" key={session.id} className={`ops-calendar-session kind-${session.kind}`} onClick={() => setSelected(session)}><strong>{session.courseCode} · {session.courseName}</strong><span>{session.facultyName} · {session.roomName}</span><span>{session.timeLabel} · {session.studentGroups.map((group) => group.id).join(', ')}</span></button>)}</div>)}
          </div>)}
        </div></div>}
      </section>}
      <section className="ops-card"><div className="ops-card-heading"><div><h2>Assignments</h2><p>Course, faculty, room, period, type and student groups from the selected persisted schedule.</p></div></div>
        {displaySessions.length === 0 ? <div className="ops-empty"><Clock3 size={18} /><strong>No assignments match</strong><span>Change or clear the timetable filters.</span></div> : <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Course</th><th>Type</th><th>Faculty</th><th>Groups</th><th>Day / periods</th><th>Room</th></tr></thead><tbody>{displaySessions.map((session) => <tr key={session.id} onClick={() => setSelected(session)} style={{ cursor: 'pointer' }}><td>{session.courseCode} · {session.courseName}</td><td>{session.kind}</td><td>{session.facultyName}</td><td className="wrap-cell">{session.studentGroups.map((group) => group.name).join(', ')}</td><td>{session.day} · {session.timeLabel}</td><td>{session.roomName} · {session.roomId}</td></tr>)}</tbody></table></div>}
      </section>
    </>}
    {selected && <SessionDetailsDialog session={selected} weekStart={selectedWeekStart} onClose={() => setSelected(null)} />}
  </div>
}
