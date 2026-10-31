import { AlertTriangle, Armchair, Building2, CalendarDays, Clock3, DoorOpen, UsersRound } from 'lucide-react'
import type { ExaminationView } from '../../types/examination'

type ExaminationCardProps = { examination: ExaminationView; onSelect: (examination: ExaminationView) => void }

function dateLabel(date?: string) {
  if (!date) return 'Date not provided'
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? date : new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(parsed)
}

export function ExaminationCard({ examination, onSelect }: ExaminationCardProps) {
  const allocations = examination.roomAllocations ?? []
  const conflicts = examination.conflicts ?? []
  const courseTitle = [examination.courseCode, examination.courseName].filter(Boolean).join(' · ')

  return (
    <button type="button" className="examination-card" onClick={() => onSelect(examination)}>
      <span className="examination-card-date"><CalendarDays size={14} />{dateLabel(examination.date)}</span>
      <span className="examination-card-heading"><strong>{examination.name}</strong>{examination.examinationType && <span className="examination-type-chip">{examination.examinationType}</span>}</span>
      {courseTitle && <span className="examination-card-course">{courseTitle}</span>}
      {(examination.startTime || examination.endTime) && <span className="examination-card-meta"><Clock3 size={13} />{examination.startTime ?? 'Time not provided'}{examination.endTime ? ` – ${examination.endTime}` : ''}</span>}
      <span className="examination-card-meta"><UsersRound size={13} />{examination.studentGroups?.length ? examination.studentGroups.join(', ') : 'Student groups not provided'}</span>
      {examination.expectedAttendance !== undefined && <span className="examination-card-meta"><Armchair size={13} />Expected attendance: {examination.expectedAttendance}</span>}
      {allocations.length ? <span className="examination-card-allocations">{allocations.map((allocation) => <span key={allocation.roomId}><DoorOpen size={12} />{allocation.roomName}{allocation.building ? ` · ${allocation.building}` : ''}{allocation.allocationStatus ? ` · ${allocation.allocationStatus}` : ''}</span>)}</span> : <span className="examination-card-unassigned"><Building2 size={13} />Room allocation not provided</span>}
      {conflicts.length > 0 && <span className="examination-card-conflicts"><AlertTriangle size={13} />{conflicts.length} solver diagnostic{conflicts.length === 1 ? '' : 's'}</span>}
      <span className="examination-card-footer">View examination details <span aria-hidden="true">→</span></span>
    </button>
  )
}
