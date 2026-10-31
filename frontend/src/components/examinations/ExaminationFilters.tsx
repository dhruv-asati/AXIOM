import { Search, SlidersHorizontal, X } from 'lucide-react'
import { SmoothInput } from '../ui/SmoothInput'
import type { ExaminationView } from '../../types/examination'

export type ExaminationFilterValues = { search: string; department: string; type: string; room: string; group: string }
type ExaminationFiltersProps = {
  examinations: ExaminationView[]
  values: ExaminationFilterValues
  onChange: (key: keyof ExaminationFilterValues, value: string) => void
  onClear: () => void
}

function uniqueOptions(values: string[]) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)) }

export function ExaminationFilters({ examinations, values, onChange, onClear }: ExaminationFiltersProps) {
  const enabled = examinations.length > 0
  const hasFilters = Object.values(values).some(Boolean)
  const rooms = uniqueOptions(examinations.flatMap((exam) => (exam.roomAllocations ?? []).map((room) => `${room.roomName} · ${room.roomId}`)))
  const groups = uniqueOptions(examinations.flatMap((exam) => exam.studentGroups ?? []))
  const select = (key: Exclude<keyof ExaminationFilterValues, 'search'>, label: string, options: string[], optionValue?: (option: string) => string) => (
    <label className="examination-filter-control" key={key}><span>{label}</span><select value={values[key]} disabled={!enabled} onChange={(event) => onChange(key, event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map((option) => <option key={option} value={optionValue ? optionValue(option) : option}>{option}</option>)}</select></label>
  )

  return (
    <section className="examination-filters" aria-label="Examination search and filters">
      <div className="examination-filter-heading"><span><SlidersHorizontal size={14} />Search and filters</span><button type="button" onClick={onClear} disabled={!hasFilters}><X size={13} />Clear filters</button></div>
      <div className="examination-filter-grid">
        <label className="examination-search-field"><span className="sr-only">Search examinations</span><Search size={15} aria-hidden="true" /><SmoothInput type="search" value={values.search} onChange={(event) => onChange('search', event.target.value)} placeholder="Search exam, course, room or group" disabled={!enabled} /></label>
        {select('department', 'Department', uniqueOptions(examinations.map((exam) => exam.department ?? '')))}
        {select('type', 'Examination type', uniqueOptions(examinations.map((exam) => exam.examinationType ?? '')))}
        {select('room', 'Room', rooms, (option) => option.split(' · ').at(-1) ?? option)}
        {select('group', 'Student group', groups)}
      </div>
      {!enabled && <p className="examination-filter-note">Filters become available when the solver/backend schedule contract is connected.</p>}
    </section>
  )
}
