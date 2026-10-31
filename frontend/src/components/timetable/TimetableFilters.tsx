import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { TimetableSession } from '../../types/timetable'
import { SmoothInput } from '../ui/SmoothInput'

export type TimetableFilterValues = {
  department: string
  faculty: string
  room: string
  course: string
  group: string
  search: string
}

type TimetableFiltersProps = {
  sessions: TimetableSession[]
  filters: TimetableFilterValues
  onChange: (key: keyof TimetableFilterValues, value: string) => void
  onClear: () => void
}

function uniqueOptions(items: Array<{ value: string; label: string }>) {
  return Array.from(new Map(items.map((item) => [item.value, item])).values())
    .sort((left, right) => left.label.localeCompare(right.label))
}

export function TimetableFilters({ sessions, filters, onChange, onClear }: TimetableFiltersProps) {
  const enabled = sessions.length > 0
  const hasFilters = Object.values(filters).some(Boolean)
  const departments = uniqueOptions(sessions.map((session) => ({ value: session.department, label: session.department })))
  const faculty = uniqueOptions(sessions.map((session) => ({ value: session.facultyId, label: session.facultyName })))
  const rooms = uniqueOptions(sessions.map((session) => ({ value: session.roomId, label: `${session.roomName} · ${session.roomId}` })))
  const courses = uniqueOptions(sessions.map((session) => ({ value: session.courseCode, label: `${session.courseCode} · ${session.courseName}` })))
  const groups = uniqueOptions(sessions.flatMap((session) => session.studentGroups.map((group) => ({ value: group.id, label: group.name }))))

  const pluralLabels: Record<Exclude<keyof TimetableFilterValues, 'search'>, string> = {
    department: 'departments',
    faculty: 'faculty',
    room: 'rooms',
    course: 'courses',
    group: 'student groups',
  }

  const selectFilter = (key: Exclude<keyof TimetableFilterValues, 'search'>, label: string, options: Array<{ value: string; label: string }>) => (
    <label className="timetable-filter-control" key={key}>
      <span>{label}</span>
      <select value={filters[key]} onChange={(event) => onChange(key, event.target.value)} disabled={!enabled}>
        <option value="">All {pluralLabels[key]}</option>
        {options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </select>
    </label>
  )

  return (
    <section className="timetable-filter-panel" aria-label="Timetable filters">
      <div className="filter-panel-heading">
        <span><SlidersHorizontal size={15} aria-hidden="true" /> Filters</span>
        <button type="button" className="clear-filters-button" onClick={onClear} disabled={!hasFilters}>
          <X size={13} aria-hidden="true" /> Clear filters
        </button>
      </div>
      <div className="timetable-filter-grid">
        <label className="timetable-filter-control timetable-search-control">
          <span>Search sessions</span>
          <span className="timetable-search-input">
            <Search size={15} aria-hidden="true" />
            <SmoothInput
              type="search"
              value={filters.search}
              onChange={(event) => onChange('search', event.target.value)}
              placeholder="Course, faculty, room or group"
              disabled={!enabled}
              aria-label="Search course, course code, faculty, room or student group"
            />
          </span>
        </label>
        {selectFilter('department', 'Department', departments)}
        {selectFilter('faculty', 'Faculty', faculty)}
        {selectFilter('room', 'Room', rooms)}
        {selectFilter('course', 'Course', courses)}
        {selectFilter('group', 'Student group', groups)}
      </div>
      {!enabled && <p className="filter-unavailable-note">Filters are enabled when timetable sessions are available.</p>}
    </section>
  )
}
