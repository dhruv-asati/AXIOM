import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, DoorOpen, LoaderCircle, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { getDataset } from '../api/datasets'
import { assignRoomDepartment, listRooms, listSchedules } from '../api/resources'
import { invalidateApiCache } from '../api/client'
import { useDatasetContext } from '../context/DatasetContext'
import type { DatasetCalendar, RoomRecord, ScheduleSummary } from '../types/api'
import './Operations.css'
import { SkeletonPage, SkeletonCard } from '../components/ui/Skeleton'
import { useAuth } from '../auth/AuthContext'
import { SmoothInput } from '../components/ui/SmoothInput'

export function RoomsPage() {
  const { user } = useAuth()
  const { selectedDatasetId } = useDatasetContext()
  const [rooms, setRooms] = useState<RoomRecord[]>([])
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([])
  const [calendar, setCalendar] = useState<DatasetCalendar | null>(null)
  const [scheduleId, setScheduleId] = useState('')
  const [roomType, setRoomType] = useState('')
  const [minCapacity, setMinCapacity] = useState('')
  const [accessible, setAccessible] = useState('')
  const [day, setDay] = useState('')
  const [period, setPeriod] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metadataLoadedFor, setMetadataLoadedFor] = useState('')
  const [loadedDatasetId, setLoadedDatasetId] = useState('')
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, string>>({})
  const [departmentNotice, setDepartmentNotice] = useState('')
  const request = useRef<AbortController | null>(null)

  const loadRooms = useCallback(async (force = false) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    if (!selectedDatasetId) { setRooms([]); setLoadedDatasetId(''); setLoading(false); return }
    if (metadataLoadedFor !== selectedDatasetId) return
    setLoading(true); setError('')
    if (force && selectedDatasetId) invalidateApiCache(`/datasets/${selectedDatasetId}/rooms`)
    try {
      const options: Record<string, string | number | boolean | undefined> = {
        schedule_id: scheduleId || undefined, room_type: roomType || undefined,
        min_capacity: minCapacity ? Number(minCapacity) : undefined,
        accessible: accessible ? accessible === 'true' : undefined,
        day: day || undefined, period: day && period ? Number(period) : undefined,
        available_only: availableOnly,
      }
      const result = await listRooms(selectedDatasetId, options, controller.signal)
      if (controller.signal.aborted) return
      setRooms(result); setLoadedDatasetId(selectedDatasetId)
    } catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Room information could not be loaded'); setRooms([]); setLoadedDatasetId(selectedDatasetId) } }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }, [selectedDatasetId, metadataLoadedFor, scheduleId, roomType, minCapacity, accessible, day, period, availableOnly])

  useEffect(() => {
    if (!selectedDatasetId) { setCalendar(null); setSchedules([]); setScheduleId(''); setMetadataLoadedFor(''); setLoading(false); return }
    const controller = new AbortController()
    setRooms([]); setLoadedDatasetId(''); setMetadataLoadedFor(''); setCalendar(null); setSchedules([]); setScheduleId('')
    setLoading(true); setError('')
    void Promise.all([getDataset(selectedDatasetId, controller.signal), listSchedules(selectedDatasetId, controller.signal)]).then(([dataset, next]) => {
      if (controller.signal.aborted) return
      setCalendar(dataset.calendar); setSchedules(next)
      setScheduleId(next.find((row) => row.status === 'complete')?.schedule_id ?? '')
      setMetadataLoadedFor(selectedDatasetId)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Dataset schedule metadata unavailable'); setLoadedDatasetId(selectedDatasetId); setLoading(false) } })
    return () => controller.abort()
  }, [selectedDatasetId])
  useEffect(() => { void loadRooms(); return () => request.current?.abort() }, [loadRooms])

  const types = [...new Set(rooms.map((room) => room.room_type))].sort()
  const periods = calendar?.periods.filter((entry) => entry.teaching) ?? []

  const saveDepartment = async (room: RoomRecord) => {
    if (!selectedDatasetId) return
    setError(''); setDepartmentNotice('')
    try {
      const result = await assignRoomDepartment(selectedDatasetId, room.room_id, departmentDrafts[room.room_id]?.trim() || null)
      setRooms((current) => current.map((row) => row.room_id === room.room_id ? { ...row, department: result.department } : row))
      setDepartmentNotice(`${room.name} ownership ${result.department ? `assigned to ${result.department}` : 'cleared'}.`)
      invalidateApiCache(`/datasets/${selectedDatasetId}/rooms`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Room ownership could not be saved') }
  }

  return <div className="ops-page">
    <PageHeader eyebrow="CAMPUS VENUES" title="Room directory" description="Inspect room features, scheduled period use, and availability from actual room records." />
    <section className="ops-toolbar">
      <label className="ops-field">Schedule for utilisation<select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">No schedule selected</option>{schedules.map((schedule) => <option key={schedule.schedule_id} value={schedule.schedule_id}>{new Date(schedule.created_at).toLocaleString()} · {schedule.status}</option>)}</select></label>
      <label className="ops-field">Room type<select value={roomType} onChange={(event) => setRoomType(event.target.value)}><option value="">All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="ops-field">Minimum capacity<input min="0" type="number" value={minCapacity} onChange={(event) => setMinCapacity(event.target.value)} placeholder="Any" /></label>
      <label className="ops-field">Accessibility<select value={accessible} onChange={(event) => setAccessible(event.target.value)}><option value="">Any</option><option value="true">Accessible</option><option value="false">Not accessible</option></select></label>
      <label className="ops-field">Availability day<select value={day} onChange={(event) => { setDay(event.target.value); setPeriod('') }}><option value="">Not checked</option>{calendar?.days.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="ops-field">Period<select value={period} disabled={!day} onChange={(event) => setPeriod(event.target.value)}><option value="">Select period</option>{periods.map((value) => <option key={value.id} value={value.id}>P{value.id} {value.start ?? ''}</option>)}</select></label>
      <label className="ops-check-row"><input type="checkbox" checked={availableOnly} disabled={!day || !period} onChange={(event) => setAvailableOnly(event.target.checked)} />Only available at selected slot</label>
      <button className="ops-button" type="button" disabled={loading} onClick={() => void loadRooms(true)}>{loading ? <LoaderCircle size={14} className="is-spinning" /> : <RefreshCw size={14} />}Refresh</button>
    </section>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15} />{error}<button className="ops-button" type="button" onClick={() => void loadRooms(true)}>Retry</button></div>}
    {departmentNotice && <div className="ops-message success" role="status">{departmentNotice}</div>}
    {loading && loadedDatasetId !== selectedDatasetId && <SkeletonPage label="Loading rooms"><div className="ops-card-grid">{Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />)}</div></SkeletonPage>}
    {loading && loadedDatasetId === selectedDatasetId && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton" />Refreshing room records…</span>}
    {!loading && !error && loadedDatasetId === selectedDatasetId && rooms.length === 0 && <div className="ops-empty"><DoorOpen size={20} /><strong>No rooms match</strong><span>Import a dataset or adjust the filters.</span></div>}
    {loadedDatasetId === selectedDatasetId && rooms.length > 0 && <div className="ops-card-grid">{rooms.map((room) => <article className="ops-record-card" key={room.room_id}>
      <header><h3>{room.name}</h3><span className={`ops-badge ${room.availability === 'available' ? 'good' : room.availability === 'unavailable' || room.availability === 'occupied' ? 'warn' : ''}`}>{room.availability.replace('_', ' ')}</span></header>
      <p>{room.room_type} · {room.building}</p>
      <div className="ops-detail-grid"><div className="ops-detail"><span>Capacity</span><strong>{room.capacity}</strong></div><div className="ops-detail"><span>Accessible</span><strong>{room.accessible ? 'Yes' : 'No'}</strong></div><div className="ops-detail"><span>Scheduled teaching periods</span><strong>{room.scheduled_periods}</strong></div><div className="ops-detail"><span>Unavailable periods</span><strong>{room.unavailable_periods}</strong></div><div className="ops-detail"><span>Utilisation</span><strong>{room.utilization_percent === null ? 'No schedule' : `${room.utilization_percent}%`}</strong></div></div>
      <p><strong>Features:</strong> {room.features.length ? room.features.join(', ') : 'None listed'}</p>
      <p><strong>Allowed use:</strong> {room.allowed_uses.join(', ') || 'Not specified'}</p>
      <p><strong>Department ownership:</strong> {room.department ?? 'Unassigned'}</p>
      {user?.role === 'admin' && <div className="ops-fields"><label className="ops-field">Assign department<SmoothInput value={departmentDrafts[room.room_id] ?? room.department ?? ''} onChange={(event) => setDepartmentDrafts((current) => ({ ...current, [room.room_id]: event.target.value }))} placeholder="Use a department in this dataset" /></label><button className="ops-button" type="button" onClick={() => void saveDepartment(room)}>Save ownership</button></div>}
      <span className="ops-mono ops-inline-note">{room.room_id}</span>
    </article>)}</div>}
  </div>
}
