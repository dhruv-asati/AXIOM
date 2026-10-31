import { AlertTriangle, Beaker, BookOpen, GraduationCap } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { TimetableSession } from '../../types/timetable'
import { formatSessionTime } from '../../lib/timetableTime'

type SessionCardProps = {
  session: TimetableSession
  onSelect: (session: TimetableSession) => void
  compact?: boolean
  style?: CSSProperties
}

const kindLabels: Record<TimetableSession['kind'], string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Laboratory',
  other: 'Other',
}

const KindIcon = ({ kind }: { kind: TimetableSession['kind'] }) => {
  if (kind === 'lab') return <Beaker size={13} aria-hidden="true" />
  if (kind === 'tutorial') return <GraduationCap size={13} aria-hidden="true" />
  return <BookOpen size={13} aria-hidden="true" />
}

export function SessionCard({ session, onSelect, compact = false, style }: SessionCardProps) {
  const hasConflicts = Boolean(session.conflicts?.length)
  const accessibleDetails = [
    `${session.courseCode} ${session.courseName}`,
    session.facultyName,
    session.roomName,
    formatSessionTime(session),
    kindLabels[session.kind],
  ].join(' · ')

  return (
    <button
      type="button"
      className={`timetable-session-card kind-${session.kind}${compact ? ' is-compact' : ''}${hasConflicts ? ' has-conflict' : ''}`}
      style={style}
      onClick={() => onSelect(session)}
      aria-haspopup="dialog"
      aria-label={`View session details: ${accessibleDetails}`}
      title={accessibleDetails}
    >
      <span className="session-card-heading">
        <strong>{session.courseCode}</strong>
        {hasConflicts && <AlertTriangle size={12} aria-label="Solver reported conflict" />}
      </span>
      <span className="session-card-course">{session.courseName}</span>
      <span className="session-card-faculty">{session.facultyName}</span>
      <span className="session-card-footer">
        <span>{session.roomId}</span>
        <span className="session-type-label"><KindIcon kind={session.kind} />{kindLabels[session.kind]}</span>
      </span>
      {compact && <span className="session-card-time">{formatSessionTime(session)}</span>}
    </button>
  )
}
