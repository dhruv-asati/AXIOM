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
}
