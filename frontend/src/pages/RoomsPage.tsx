<<<<<<< HEAD
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, DoorOpen, LoaderCircle, RefreshCw } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { getDataset } from '../api/datasets'
import { listRooms, listSchedules } from '../api/resources'
import { invalidateApiCache } from '../api/client'
import { useDatasetContext } from '../context/DatasetContext'
import type { DatasetCalendar, RoomRecord, ScheduleSummary } from '../types/api'
import './Operations.css'
import { SkeletonPage, SkeletonCard } from '../components/ui/Skeleton'

export function RoomsPage() {
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
    {loading && loadedDatasetId !== selectedDatasetId && <SkeletonPage label="Loading rooms"><div className="ops-card-grid">{Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />)}</div></SkeletonPage>}
    {loading && loadedDatasetId === selectedDatasetId && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton" />Refreshing room records…</span>}
    {!loading && !error && loadedDatasetId === selectedDatasetId && rooms.length === 0 && <div className="ops-empty"><DoorOpen size={20} /><strong>No rooms match</strong><span>Import a dataset or adjust the filters.</span></div>}
    {loadedDatasetId === selectedDatasetId && rooms.length > 0 && <div className="ops-card-grid">{rooms.map((room) => <article className="ops-record-card" key={room.room_id}>
      <header><h3>{room.name}</h3><span className={`ops-badge ${room.availability === 'available' ? 'good' : room.availability === 'unavailable' || room.availability === 'occupied' ? 'warn' : ''}`}>{room.availability.replace('_', ' ')}</span></header>
      <p>{room.room_type} · {room.building}</p>
      <div className="ops-detail-grid"><div className="ops-detail"><span>Capacity</span><strong>{room.capacity}</strong></div><div className="ops-detail"><span>Accessible</span><strong>{room.accessible ? 'Yes' : 'No'}</strong></div><div className="ops-detail"><span>Scheduled teaching periods</span><strong>{room.scheduled_periods}</strong></div><div className="ops-detail"><span>Unavailable periods</span><strong>{room.unavailable_periods}</strong></div><div className="ops-detail"><span>Utilisation</span><strong>{room.utilization_percent === null ? 'No schedule' : `${room.utilization_percent}%`}</strong></div></div>
      <p><strong>Features:</strong> {room.features.length ? room.features.join(', ') : 'None listed'}</p>
      <p><strong>Allowed use:</strong> {room.allowed_uses.join(', ') || 'Not specified'}</p>
      <span className="ops-mono ops-inline-note">{room.room_id}</span>
    </article>)}</div>}
  </div>
=======
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Grid2X2, List, RefreshCw, Search, SlidersHorizontal, DoorOpen } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { RoomCard } from '../components/rooms/RoomCard'
import { RoomDetailsDialog } from '../components/rooms/RoomDetailsDialog'
import { loadRooms } from '../api/venueManagement'
import type { RoomView } from '../types/venue'

type ViewMode = 'grid' | 'list'

export function RoomsPage() {
  const [rooms, setRooms] = useState<RoomView[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const [building, setBuilding] = useState('')
  const [roomType, setRoomType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [selectedRoom, setSelectedRoom] = useState<RoomView | null>(null)
  const closeRoomDialog = useCallback(() => setSelectedRoom(null), [])

  const refresh = useCallback(async () => {
    setState('loading')
    try {
      const result = await loadRooms()
      setRooms(result.records)
      setState(result.status)
      setReason(result.status === 'unavailable' ? result.reason : '')
    } catch {
      setRooms([])
      setState('error')
      setReason('Room inventory could not be loaded. Check the connection and try again.')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const buildings = useMemo(() => [...new Set(rooms.map((room) => room.building))].sort(), [rooms])
  const roomTypes = useMemo(() => [...new Set(rooms.map((room) => room.type))].sort(), [rooms])
  const filteredRooms = useMemo(() => rooms.filter((room) => {
    const query = search.trim().toLocaleLowerCase()
    const searchable = [room.id, room.name, room.building, room.type, ...(room.equipment ?? [])].join(' ').toLocaleLowerCase()
    const capacityValue = room.capacity ?? -1
    const capacityMatch = !capacity || (capacity === 'small' ? capacityValue >= 1 && capacityValue <= 25
      : capacity === 'medium' ? capacityValue >= 26 && capacityValue <= 50
        : capacity === 'large' ? capacityValue >= 51 && capacityValue <= 100
          : capacityValue >= 101)
    return (!query || searchable.includes(query)) && (!building || room.building === building)
      && (!roomType || room.type === roomType) && capacityMatch
  }), [rooms, search, building, roomType, capacity])
  const hasFilters = Boolean(search || building || roomType || capacity)

  return (
    <div className="venue-page">
      <PageHeader
        eyebrow="CAMPUS SPACES"
        title="Room Management"
        description="Manage campus venues, room capacity and availability."
        action={<button type="button" className="venue-refresh-button" onClick={() => void refresh()} disabled={state === 'loading'}><RefreshCw size={15} className={state === 'loading' ? 'venue-spinning' : ''} />Refresh</button>}
      />

      <section className="room-inventory-toolbar" aria-label="Room inventory controls">
        <label className="room-search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Search rooms</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rooms, buildings or equipment" /></label>
        <label className="room-filter"><span>Building</span><select value={building} onChange={(event) => setBuilding(event.target.value)} disabled={state !== 'ready'}><option value="">All buildings</option>{buildings.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="room-filter"><span>Room type</span><select value={roomType} onChange={(event) => setRoomType(event.target.value)} disabled={state !== 'ready'}><option value="">All types</option>{roomTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="room-filter"><span>Capacity</span><select value={capacity} onChange={(event) => setCapacity(event.target.value)} disabled={state !== 'ready'}><option value="">Any capacity</option><option value="small">1–25 seats</option><option value="medium">26–50 seats</option><option value="large">51–100 seats</option><option value="xlarge">101+ seats</option></select></label>
        <div className="room-view-switch" role="group" aria-label="Room display style"><button type="button" aria-label="Grid view" aria-pressed={view === 'grid'} className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')}><Grid2X2 size={16} /></button><button type="button" aria-label="List view" aria-pressed={view === 'list'} className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><List size={17} /></button></div>
      </section>

      {state === 'loading' ? (
        <section className="venue-loading-grid" aria-label="Loading rooms" aria-live="polite">
          {[0, 1, 2, 3].map((item) => <div className="venue-room-skeleton" key={item}><span /><div><i /><i /></div><i /><i /></div>)}
        </section>
      ) : state === 'unavailable' || state === 'error' ? (
        <section className="venue-unavailable-state" role="status">
          <span className="venue-state-icon"><Building2 size={21} /></span>
          <p className="venue-eyebrow">ROOM INVENTORY</p>
          <h2>{state === 'error' ? 'Room inventory could not be loaded' : 'Room data is not connected yet'}</h2>
          <p>{reason}</p>
          <button type="button" className="venue-secondary-button" onClick={() => void refresh()}><RefreshCw size={14} />Retry connection</button>
        </section>
      ) : (
        <>
          <div className="room-inventory-summary"><span>{filteredRooms.length} {filteredRooms.length === 1 ? 'room' : 'rooms'}</span><span><SlidersHorizontal size={13} /> Inventory filters</span></div>
          {filteredRooms.length ? <section className={`room-inventory-grid ${view === 'list' ? 'is-list' : ''}`} aria-label="Room inventory">{filteredRooms.map((room) => <RoomCard key={room.id} room={room} view={view} onSelect={setSelectedRoom} />)}</section> : (
            <section className="venue-empty-state" role="status"><span className="venue-state-icon"><DoorOpen size={21} /></span><h2>{hasFilters ? 'No rooms match these filters' : 'No rooms to display'}</h2><p>{hasFilters ? 'Try a different search or clear the selected filters.' : 'Rooms will appear here when the campus room inventory is available.'}</p>{hasFilters && <button type="button" className="venue-text-button" onClick={() => { setSearch(''); setBuilding(''); setRoomType(''); setCapacity('') }}>Clear filters</button>}</section>
          )}
        </>
      )}
      {selectedRoom && <RoomDetailsDialog room={selectedRoom} onClose={closeRoomDialog} />}
    </div>
  )
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08
}
