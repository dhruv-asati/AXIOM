import { Accessibility, Armchair, Building2, DoorOpen, MapPin, Monitor, Projector } from 'lucide-react'
import type { RoomView } from '../../types/venue'

type RoomCardProps = { room: RoomView; view: 'grid' | 'list'; onSelect: (room: RoomView) => void }

const typeTone = (type: string) => {
  const normalized = type.toLowerCase()
  if (normalized.includes('lab')) return 'room-type-lab'
  if (normalized.includes('lecture') || normalized.includes('hall')) return 'room-type-hall'
  if (normalized.includes('meeting') || normalized.includes('conference')) return 'room-type-meeting'
  return 'room-type-classroom'
}

export function RoomCard({ room, view, onSelect }: RoomCardProps) {
  return (
    <button type="button" className={`room-card ${view === 'list' ? 'is-list' : ''}`} onClick={() => onSelect(room)}>
      <span className={`room-card-symbol ${typeTone(room.type)}`}><DoorOpen size={18} aria-hidden="true" /></span>
      <span className="room-card-main">
        <span className="room-card-title-row"><strong>{room.name || room.id}</strong>{room.availabilityLabel && <span className="room-availability-label">{room.availabilityLabel}</span>}</span>
        <span className="room-card-meta"><Building2 size={13} aria-hidden="true" />{room.building}{room.floor !== undefined ? ` · Floor ${room.floor}` : ''}</span>
      </span>
      <span className="room-card-type">{room.type}</span>
      <span className="room-card-capacity"><Armchair size={14} aria-hidden="true" />{room.capacity !== undefined ? `${room.capacity} seats` : 'Capacity unavailable'}</span>
      <span className="room-card-id"><MapPin size={12} aria-hidden="true" />{room.id}</span>
      <span className="room-card-equipment" aria-label={`${room.equipment?.length ?? 0} equipment items`}>
        {(room.equipment ?? []).slice(0, 3).map((item) => <span key={item} title={item}>{/projector/i.test(item) ? <Projector size={13} /> : /display|screen|computer/i.test(item) ? <Monitor size={13} /> : <span className="room-equipment-dot" />}</span>)}
        {room.accessibility?.length ? <Accessibility size={14} aria-label="Accessibility information available" /> : null}
      </span>
      <span className="room-card-open">Room details <span aria-hidden="true">→</span></span>
    </button>
  )
}
