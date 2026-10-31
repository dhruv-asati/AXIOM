import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
  TicketCheck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

export type NavigationEntry = {
  label: string
  to: string
  icon: LucideIcon
}

export const primaryNavigation: NavigationEntry[] = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Timetable', to: '/timetable', icon: CalendarDays },
  { label: 'Room Management', to: '/rooms', icon: Warehouse },
  { label: 'Bookings', to: '/bookings', icon: TicketCheck },
  { label: 'Examinations', to: '/examinations', icon: BookOpenCheck },
  { label: 'Disruptions', to: '/disruptions', icon: ShieldAlert },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
]

export const settingsNavigation: NavigationEntry = {
  label: 'Settings',
  to: '/settings',
  icon: Settings2,
}

export const routeTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/timetable': 'Timetable',
  '/rooms': 'Room Management',
  '/bookings': 'Bookings',
  '/examinations': 'Examinations',
  '/disruptions': 'Disruptions',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
}

