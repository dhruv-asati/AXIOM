import {
  BarChart3,
  Bot,
  BookOpenCheck,
  CalendarDays,
  Database,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
  TicketCheck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '../../auth/AuthContext'

export type NavigationEntry = {
  label: string
  to: string
  icon: LucideIcon
  roles: UserRole[]
}

const admin: UserRole[] = ['admin']
const adminDepartment: UserRole[] = ['admin', 'department_coordinator']
const teaching: UserRole[] = ['admin', 'department_coordinator', 'faculty']
const venue: UserRole[] = ['admin', 'department_coordinator', 'club_representative']
export const primaryNavigation: NavigationEntry[] = [
  { label: 'Overview', to: '/dashboard', icon: LayoutDashboard, roles: admin },
  { label: 'Datasets', to: '/datasets', icon: Database, roles: admin },
  { label: 'Timetable', to: '/timetable', icon: CalendarDays, roles: teaching },
  { label: 'Room Management', to: '/rooms', icon: Warehouse, roles: venue },
  { label: 'Bookings', to: '/bookings', icon: TicketCheck, roles: venue },
  { label: 'Examinations', to: '/examinations', icon: BookOpenCheck, roles: adminDepartment },
  { label: 'Disruptions', to: '/disruptions', icon: ShieldAlert, roles: teaching },
  { label: 'Assistant', to: '/assistant', icon: Bot, roles: teaching },
  { label: 'Analytics', to: '/analytics', icon: BarChart3, roles: admin },
]

export const settingsNavigation: NavigationEntry = {
  label: 'Settings',
  to: '/settings',
  icon: Settings2,
  roles: admin,
}

export const routeTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/datasets': 'Datasets',
  '/timetable': 'Timetable',
  '/rooms': 'Room Management',
  '/bookings': 'Bookings',
  '/examinations': 'Examinations',
  '/disruptions': 'Disruptions',
  '/assistant': 'Assistant',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
}

