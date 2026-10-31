<<<<<<< HEAD
import { useEffect, useState } from 'react'
import { AlertCircle, BookOpenCheck } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { listExaminations, listSchedules } from '../api/resources'
import { useDatasetContext } from '../context/DatasetContext'
import type { ExaminationRecord, ScheduleSummary } from '../types/api'
import './Operations.css'
import { SkeletonPage, SkeletonTable } from '../components/ui/Skeleton'

export function ExaminationsPage() {
  const { selectedDatasetId } = useDatasetContext()
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [items, setItems] = useState<ExaminationRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setItems([]); setSchedules([]); setScheduleId(''); setLoadedKey('')
    if (!selectedDatasetId) { setItems([]); setSchedules([]); setScheduleId(''); setLoading(false); return () => controller.abort() }
    setLoading(true); setError('')
    listSchedules(selectedDatasetId, controller.signal).then((rows) => {
      if (!active) return
      setSchedules(rows); setScheduleId(rows.find((row) => row.status === 'complete')?.schedule_id ?? '')
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Schedules could not be loaded')).finally(() => active && setLoading(false))
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    if (!selectedDatasetId || !scheduleId) { setItems([]); return }
    setLoading(true); setError('')
    listExaminations(selectedDatasetId, scheduleId, controller.signal).then((data) => { if (active) { setItems(data.examinations); setLoadedKey(`${selectedDatasetId}:${scheduleId}`) } }).catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Examinations could not be loaded')).finally(() => active && setLoading(false))
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId, scheduleId])
  return <div className="ops-page">
    <PageHeader eyebrow="ASSESSMENT PLANNING" title="Examinations" description="Review persisted exam slots and room allocations from a generated schedule." />
    <section className="ops-toolbar"><label className="ops-field">Schedule<select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Select schedule</option>{schedules.map((s) => <option key={s.schedule_id} value={s.schedule_id}>{new Date(s.created_at).toLocaleString()} · {s.status}</option>)}</select></label></section>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15}/>{error}</div>}
    {loading && loadedKey !== `${selectedDatasetId}:${scheduleId}` && <SkeletonPage label="Loading examination allocations"><section className="ops-card"><SkeletonTable rows={8} columns={7} /></section></SkeletonPage>}
    {!loading && !error && !scheduleId && <div className="ops-empty"><BookOpenCheck size={20}/><strong>No schedule selected</strong><span>Generate a timetable to view examination allocations.</span></div>}
    {!loading && !error && loadedKey === `${selectedDatasetId}:${scheduleId}` && items.length === 0 && <div className="ops-empty"><BookOpenCheck size={20}/><strong>No examinations found</strong><span>This dataset has no examinations for this schedule.</span></div>}
    {!loading && loadedKey === `${selectedDatasetId}:${scheduleId}` && items.length > 0 && <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Examination</th><th>Courses</th><th>Student groups</th><th>Attendance</th><th>Slot</th><th>Rooms</th><th>Allocated capacity</th></tr></thead><tbody>{items.map((exam) => <tr key={exam.exam_id}><td className="ops-mono">{exam.exam_id}</td><td className="wrap-cell">{exam.course_names.join(', ') || exam.course_ids.join(', ') || '—'}</td><td className="wrap-cell">{exam.group_names.join(', ') || exam.group_ids.join(', ') || '—'}</td><td>{exam.expected_attendance}</td><td>{exam.day ? `${exam.day} · ${exam.session}` : 'Unallocated'}</td><td className="wrap-cell">{exam.rooms.map((room) => `${room.name} (${room.effective_capacity}/${room.capacity})`).join(', ') || '—'}</td><td>{exam.effective_allocated_capacity}</td></tr>)}</tbody></table></div>}
  </div>
=======
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, List, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { ExaminationCard } from '../components/examinations/ExaminationCard'
import { ExaminationDetailsDialog } from '../components/examinations/ExaminationDetailsDialog'
import { ExaminationFilters, type ExaminationFilterValues } from '../components/examinations/ExaminationFilters'
import { loadExaminations } from '../api/examinations'
import { addLocalDays, atLocalMidnight, formatDate, formatWeekRange, mondayOfWeek } from '../lib/timetableTime'
import type { ExaminationView } from '../types/examination'

type ViewMode = 'week' | 'list'
const emptyFilters: ExaminationFilterValues = { search: '', department: '', type: '', room: '', group: '' }

function matchesSearch(examination: ExaminationView, query: string) {
  if (!query.trim()) return true
  const text = [examination.id, examination.name, examination.courseCode, examination.courseName, examination.department,
    examination.examinationType, ...(examination.studentGroups ?? []),
    ...(examination.roomAllocations ?? []).flatMap((room) => [room.roomName, room.roomId, room.building]),
  ].filter(Boolean).join(' ').toLocaleLowerCase()
  return text.includes(query.trim().toLocaleLowerCase())
}

function examDateForWeek(date: string | undefined, weekStart: Date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const start = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate())
  const end = addLocalDays(start, 6)
  const endKey = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  return date >= startKey && date <= endKey
}

export function ExaminationsPage() {
  const [examinations, setExaminations] = useState<ExaminationView[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => atLocalMidnight(new Date()))
  const [view, setView] = useState<ViewMode>(() => window.matchMedia('(max-width: 760px)').matches ? 'list' : 'week')
  const [filters, setFilters] = useState(emptyFilters)
  const [selectedExamination, setSelectedExamination] = useState<ExaminationView | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    setLoadError('')
    try {
      const result = await loadExaminations()
      setExaminations(result.examinations)
      setState(result.status)
      if (result.status === 'unavailable') setLoadError(result.reason)
    } catch {
      setExaminations([])
      setState('error')
      setLoadError('Examination schedule could not be loaded. Check the connection and try again.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const weekStart = useMemo(() => mondayOfWeek(selectedDate), [selectedDate])
  const filteredExaminations = useMemo(() => examinations.filter((exam) => {
    const roomIds = (exam.roomAllocations ?? []).map((room) => room.roomId)
    return matchesSearch(exam, filters.search)
      && (!filters.department || exam.department === filters.department)
      && (!filters.type || exam.examinationType === filters.type)
      && (!filters.room || roomIds.includes(filters.room))
      && (!filters.group || exam.studentGroups?.includes(filters.group))
  }), [examinations, filters])
  const weekExaminations = useMemo(() => filteredExaminations.filter((exam) => examDateForWeek(exam.date, weekStart)), [filteredExaminations, weekStart])
  const orderedExaminations = useMemo(() => [...filteredExaminations].sort((left, right) => (
    (left.date ?? '9999-12-31').localeCompare(right.date ?? '9999-12-31')
      || (left.startTime ?? '').localeCompare(right.startTime ?? '')
      || left.name.localeCompare(right.name)
  )), [filteredExaminations])
  const hasFilters = Object.values(filters).some(Boolean)
  const closeDetails = useCallback(() => setSelectedExamination(null), [])

  const moveWeek = (amount: number) => setSelectedDate((date) => addLocalDays(date, amount * 7))
  const setFilter = (key: keyof ExaminationFilterValues, value: string) => setFilters((current) => ({ ...current, [key]: value }))

  return (
    <div className="examinations-page">
      <PageHeader
        className="examinations-page-header"
        eyebrow="ACADEMIC OPERATIONS"
        title="Examination Management"
        description="View and manage examination schedules across campus."
        action={<div className="exam-date-controls"><div className="exam-week-navigation" aria-label="Examination date navigation"><button type="button" aria-label="Previous week" onClick={() => moveWeek(-1)}><ChevronLeft size={16} /></button><span><CalendarDays size={14} />{formatWeekRange(weekStart)}</span><button type="button" aria-label="Next week" onClick={() => moveWeek(1)}><ChevronRight size={16} /></button></div><button type="button" className="exam-today-button" onClick={() => setSelectedDate(atLocalMidnight(new Date()))}>Today</button><button type="button" className="exam-refresh-button" onClick={() => void load()} disabled={state === 'loading'}><RefreshCw size={14} className={state === 'loading' ? 'exam-spin' : ''} /><span>Refresh</span></button></div>}
      />

      {state === 'unavailable' && <div className="examination-state-banner is-unavailable" role="status"><AlertTriangle size={15} /><span><strong>Schedule data unavailable</strong> — {loadError}</span></div>}
      {state === 'error' && <div className="examination-state-banner is-error" role="alert"><AlertTriangle size={15} /><span><strong>Could not load examinations</strong> — {loadError}</span><button type="button" onClick={() => void load()}>Retry</button></div>}
      {state === 'ready' && <div className="examination-state-banner is-ready" role="status"><span className="exam-status-dot" />Showing solver/backend examination data only.</div>}

      <ExaminationFilters examinations={examinations} values={filters} onChange={setFilter} onClear={() => setFilters(emptyFilters)} />

      <section className="examination-overview" aria-label="Examination schedule overview">
        <div className="examination-overview-heading">
          <div><span className="exam-section-icon"><ClipboardList size={16} /></span><div><p>EXAMINATION SCHEDULE</p><h2>{view === 'week' ? 'Weekly overview' : 'Chronological list'}</h2></div></div>
          <div className="examination-overview-actions">
            {state === 'ready' && <span className="exam-result-count">{filteredExaminations.length} examination{filteredExaminations.length === 1 ? '' : 's'}</span>}
            <div className="exam-view-switch" role="group" aria-label="Examination schedule view"><button type="button" aria-pressed={view === 'week'} className={view === 'week' ? 'is-active' : ''} onClick={() => setView('week')}><CalendarDays size={14} />Week</button><button type="button" aria-pressed={view === 'list'} className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><List size={14} />List</button></div>
          </div>
        </div>

        {state === 'loading' ? <div className="examination-loading-list" aria-label="Loading examinations" role="status">{[0, 1, 2].map((item) => <div key={item}><i /><span><i /><i /></span></div>)}</div>
          : state === 'unavailable' ? <div className="examination-empty-state"><span><CalendarDays size={22} /></span><h3>No examination schedule connected</h3><p>The source exam dataset contains exam requirements, but no solver-produced dates, times, room allocations, or conflicts.</p></div>
            : state === 'error' ? <div className="examination-empty-state"><span><AlertTriangle size={22} /></span><h3>Examinations could not be loaded</h3><p>Retry the schedule request when the examination service is available.</p><button type="button" onClick={() => void load()}>Try again</button></div>
              : view === 'week' ? (
                <div className="examination-week-scroll" role="region" aria-label="Weekly examination calendar" tabIndex={0}>
                  <div className="examination-week-grid">{Array.from({ length: 6 }, (_, index) => {
                    const dayDate = addLocalDays(weekStart, index)
                    const key = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`
                    const dayExaminations = weekExaminations.filter((exam) => exam.date === key)
                    return <section className="examination-day-column" key={key} aria-label={formatDate(dayDate, { weekday: 'long', day: 'numeric', month: 'long' })}><header><span>{formatDate(dayDate, { weekday: 'short' })}</span><strong>{formatDate(dayDate, { day: 'numeric', month: 'short' })}</strong></header><div className="examination-day-cards">{dayExaminations.map((exam) => <ExaminationCard key={exam.id} examination={exam} onSelect={setSelectedExamination} />)}</div></section>
                  })}</div>
                  {weekExaminations.length === 0 && <div className="examination-calendar-empty" role="status"><CalendarDays size={20} /><strong>{hasFilters ? 'No examinations match these filters in this week' : 'No scheduled examinations in this week'}</strong><span>{hasFilters ? 'Clear filters or move to another week.' : 'Solver-provided examination dates will appear here.'}</span>{hasFilters && <button type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}</div>}
                </div>
              ) : orderedExaminations.length ? <div className="examination-list-view">{orderedExaminations.map((exam) => <ExaminationCard key={exam.id} examination={exam} onSelect={setSelectedExamination} />)}</div>
                : <div className="examination-empty-state"><span><CalendarDays size={22} /></span><h3>{hasFilters ? 'No examinations match these filters' : 'No examination records'}</h3><p>{hasFilters ? 'Clear filters to view all returned examinations.' : 'Examination records will appear when the solver schedule is available.'}</p>{hasFilters && <button type="button" onClick={() => setFilters(emptyFilters)}>Clear filters</button>}</div>}
      </section>

      <p className="examination-contract-note"><AlertTriangle size={14} />Room allocations and conflict diagnostics are displayed only when supplied by the official solver/backend. The frontend does not allocate rooms or validate schedules.</p>
      {selectedExamination && <ExaminationDetailsDialog examination={selectedExamination} onClose={closeDetails} />}
    </div>
  )
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08
}
