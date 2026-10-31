import { AlertTriangle, CalendarClock, DoorOpen, MessageSquareText, TicketCheck, type LucideIcon } from 'lucide-react'
import type { UserRole } from '../../auth/AuthContext'
import { getNavigationForRole } from '../layout/navigation'

export type AssistantMode = 'booking' | 'disruption'
export type AssistantCommand = {
  id: string
  group: 'Suggestions' | 'Quick actions' | 'Go to'
  label: string
  description: string
  keywords: string[]
  icon: LucideIcon
  type: 'template' | 'action' | 'route'
  template?: string
  mode?: AssistantMode
  href?: string
}

const requestTemplates: AssistantCommand[] = [
  {
    id: 'room-unavailable', group: 'Suggestions', label: 'Report a room unavailable',
    description: 'Describe a room closure so the disruption parser can extract it.',
    keywords: ['room', 'closed', 'unavailable', 'closure', 'maintenance'], icon: DoorOpen,
    type: 'template', mode: 'disruption',
    template: 'Room [room ID] is unavailable on [day] during periods [periods] because [reason].',
  },
  {
    id: 'faculty-unavailable', group: 'Suggestions', label: 'Report faculty unavailability',
    description: 'Describe when a faculty member cannot teach.',
    keywords: ['faculty', 'teacher', 'instructor', 'unavailable', 'leave'], icon: CalendarClock,
    type: 'template', mode: 'disruption',
    template: 'Faculty member [faculty ID] is unavailable on [day] during periods [periods] because [reason].',
  },
  {
    id: 'remove-session', group: 'Suggestions', label: 'Request a session change',
    description: 'Ask the disruption parser to interpret a session removal or change.',
    keywords: ['session', 'class', 'remove', 'cancel', 'change', 'reschedule'], icon: AlertTriangle,
    type: 'template', mode: 'disruption',
    template: 'Please remove or reschedule session [session ID] on [day] because [reason].',
  },
  {
    id: 'booking-event', group: 'Suggestions', label: 'Draft a venue booking request',
    description: 'Describe an event for the booking parser to structure for review.',
    keywords: ['booking', 'venue', 'event', 'room', 'attendance', 'capacity'], icon: TicketCheck,
    type: 'template', mode: 'booking',
    template: 'Request a [event category] for [event name] on [day] from [start time] to [end time] for [attendee count] people. Room needs: [requirements].',
  },
]

const modeActions: AssistantCommand[] = [
  { id: 'mode-disruption', group: 'Quick actions', label: 'Switch to disruption parser', description: 'Parse a room, faculty, or session change request.', keywords: ['disruption', 'change', 'unavailability'], icon: AlertTriangle, type: 'action', mode: 'disruption' },
  { id: 'mode-booking', group: 'Quick actions', label: 'Switch to booking parser', description: 'Parse a venue booking request for review.', keywords: ['booking', 'venue', 'event'], icon: MessageSquareText, type: 'action', mode: 'booking' },
]

export function getAssistantCommands(role: UserRole): AssistantCommand[] {
  const routes: AssistantCommand[] = getNavigationForRole(role).map((entry) => ({
    id: `route-${entry.id}`, group: 'Go to', label: entry.label,
    description: `Open ${entry.label.toLowerCase()}.`, keywords: [entry.id, entry.to],
    icon: entry.icon, type: 'route', href: entry.to,
  }))
  return [...requestTemplates, ...modeActions, ...routes]
}

function matchesQuery(command: AssistantCommand, query: string): boolean {
  const normalized = query.toLocaleLowerCase().trim()
  if (!normalized) return true
  const text = [command.label, command.description, ...command.keywords].join(' ').toLocaleLowerCase()
  if (text.includes(normalized)) return true
  // Small subsequence matcher gives useful fuzzy matching without a dependency.
  let cursor = 0
  for (const character of normalized) {
    cursor = text.indexOf(character, cursor)
    if (cursor < 0) return false
    cursor += 1
  }
  return true
}

export function filterAssistantCommands(commands: AssistantCommand[], query: string): AssistantCommand[] {
  return commands.filter((command) => matchesQuery(command, query))
}
