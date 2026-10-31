import { useEffect } from 'react'
import { AlertTriangle, Beaker, BookOpen, GraduationCap, MapPin, X } from 'lucide-react'
import type { TimetableSession } from '../../types/timetable'
import { addLocalDays, formatDate, formatSessionTime } from '../../lib/timetableTime'

type SessionDetailsDialogProps = {
  session: TimetableSession
  weekStart: Date
  onClose: () => void
}

const kindLabels: Record<TimetableSession['kind'], string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Laboratory',
  other: 'Other',
}

function Detail({ label, children }: { label: string; children?: string | null }) {
  if (!children) return null
  return <div className="session-detail-row"><dt>{label}</dt><dd>{children}</dd></div>
}

export function SessionDetailsDialog({ session, weekStart, onClose }: SessionDetailsDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const dayIndex = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].indexOf(session.day)
  const sessionDate = addLocalDays(weekStart, Math.max(0, dayIndex))
  const KindIcon = session.kind === 'lab' ? Beaker : session.kind === 'tutorial' ? GraduationCap : BookOpen

  return (
    <div className="session-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="session-details-dialog" role="dialog" aria-modal="true" aria-labelledby="session-dialog-title" tabIndex={-1}>
        <header className="session-dialog-header">
          <div className={`session-detail-kind kind-${session.kind}`}><KindIcon size={16} aria-hidden="true" /><span>{kindLabels[session.kind]}</span></div>
          <button type="button" className="session-dialog-close" onClick={onClose} aria-label="Close session details" autoFocus>
            <X size={18} />
          </button>
        </header>
        <div className="session-dialog-title-block">
          <p className="section-eyebrow">SESSION DETAILS</p>
          <h2 id="session-dialog-title">{session.courseName || session.courseCode}</h2>
          {session.courseCode && <span className="session-course-code">{session.courseCode}</span>}
        </div>
        {session.conflicts && session.conflicts.length > 0 && (
          <section className="solver-conflict-list" aria-label="Solver-reported conflicts">
            {session.conflicts.map((conflict, index) => (
              <div className="solver-conflict-item" key={`${conflict.type}-${index}`}>
                <AlertTriangle size={15} aria-hidden="true" />
                <div><strong>{conflict.type}</strong>
                  {conflict.description && <p>{conflict.description}</p>}
                  {conflict.affectedRoom && <span><MapPin size={12} /> {conflict.affectedRoom}</span>}
                  {conflict.affectedFaculty && <span>{conflict.affectedFaculty}</span>}
                </div>
              </div>
            ))}
          </section>
        )}
        <dl className="session-detail-list">
          <Detail label="Faculty">{session.facultyName}</Detail>
          <Detail label="Room">{`${session.roomName}${session.roomId ? ` · ${session.roomId}` : ''}`}</Detail>
          <Detail label="Student group">{session.studentGroups.map((group) => group.name || group.id).join(', ')}</Detail>
          <Detail label="Date in selected week">{formatDate(sessionDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Detail>
          <Detail label="Time">{formatSessionTime(session)}</Detail>
          <Detail label="Session type">{kindLabels[session.kind]}</Detail>
        </dl>
        {(!session.conflicts || session.conflicts.length === 0) && (
          <p className="session-conflict-unavailable">Solver conflict diagnostics are not included for this session.</p>
        )}
      </section>
    </div>
  )
}
