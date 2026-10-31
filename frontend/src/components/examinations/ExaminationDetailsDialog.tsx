import { useEffect, useRef } from 'react'
import { Accessibility, AlertTriangle, Armchair, Building2, CalendarDays, DoorOpen, UsersRound, X } from 'lucide-react'
import type { ExaminationView } from '../../types/examination'

type ExaminationDetailsDialogProps = { examination: ExaminationView; onClose: () => void }

function Detail({ label, children }: { label: string; children?: string | number }) {
  if (children === undefined || children === '') return null
  return <div className="examination-detail-row"><dt>{label}</dt><dd>{children}</dd></div>
}

export function ExaminationDetailsDialog({ examination, onClose }: ExaminationDetailsDialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [onClose])

  const allocations = examination.roomAllocations ?? []
  const conflicts = examination.conflicts ?? []

  return (
    <div className="examination-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="examination-details-dialog" role="dialog" aria-modal="true" aria-labelledby="examination-details-title" tabIndex={-1}>
        <header className="examination-dialog-header"><span>EXAMINATION DETAILS</span><button type="button" onClick={onClose} aria-label="Close examination details"><X size={17} /></button></header>
        <div className="examination-dialog-title"><span className="examination-dialog-icon"><CalendarDays size={18} /></span><div><h2 id="examination-details-title">{examination.name}</h2><p>{examination.id}</p></div></div>
        <dl className="examination-detail-list">
          <Detail label="Course code">{examination.courseCode}</Detail>
          <Detail label="Course name">{examination.courseName}</Detail>
          <Detail label="Department">{examination.department}</Detail>
          <Detail label="Examination date">{examination.date}</Detail>
          <Detail label="Start time">{examination.startTime}</Detail>
          <Detail label="End time">{examination.endTime}</Detail>
          <Detail label="Examination type">{examination.examinationType}</Detail>
          <Detail label="Student groups">{examination.studentGroups?.join(', ')}</Detail>
          <Detail label="Expected attendance">{examination.expectedAttendance}</Detail>
          <Detail label="Invigilator">{examination.invigilators?.join(', ')}</Detail>
        </dl>

        <section className="examination-modal-section" aria-labelledby="exam-allocations-title">
          <h3 id="exam-allocations-title"><DoorOpen size={15} />Room allocations</h3>
          {allocations.length ? <div className="exam-allocation-list">{allocations.map((allocation) => <article className="exam-allocation-card" key={allocation.roomId}>
            <div className="exam-allocation-heading"><strong>{allocation.roomName}</strong><span>{allocation.allocationStatus ?? 'Allocation status not supplied'}</span></div>
            <p><Building2 size={13} />{allocation.building ?? 'Building not supplied'} <span>·</span> {allocation.roomId}</p>
            <div className="exam-allocation-facts">{allocation.capacity !== undefined && <span><Armchair size={13} />Capacity {allocation.capacity}</span>}{allocation.assignedAttendance !== undefined && <span><UsersRound size={13} />Assigned {allocation.assignedAttendance}</span>}</div>
          </article>)}</div> : <p className="exam-modal-empty"><Accessibility size={14} />No room allocation was supplied. This does not indicate room availability.</p>}
        </section>

        <section className="examination-modal-section" aria-labelledby="exam-conflicts-title">
          <h3 id="exam-conflicts-title"><AlertTriangle size={15} />Solver diagnostics</h3>
          {conflicts.length ? <div className="exam-diagnostic-list">{conflicts.map((conflict, index) => <article key={`${conflict.type}-${index}`}><strong>{conflict.type}</strong>{conflict.affectedExamination && <span>Affected examination: {conflict.affectedExamination}</span>}{conflict.affectedResource && <span>Affected resource: {conflict.affectedResource}</span>}{conflict.explanation && <p>{conflict.explanation}</p>}</article>)}</div> : <p className="exam-modal-empty">No solver diagnostics were supplied for this examination.</p>}
        </section>
        <footer className="exam-modal-note">AXIOM displays allocation and conflict information supplied by the official solver/backend. It does not independently validate exam schedules.</footer>
      </section>
    </div>
  )
}
