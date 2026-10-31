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
}
