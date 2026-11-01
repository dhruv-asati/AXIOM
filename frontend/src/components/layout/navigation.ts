import {
  BarChart3,
  Building2,
  Bot,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  Database,
  LayoutDashboard,
  Settings2,
  ShieldAlert,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import type { UserRole } from '../../auth/AuthContext'

export type NavigationEntry = {
  id: string
  label: string
  to: string
  icon: LucideIcon
  roles: UserRole[]
}

const admin: UserRole[] = ['admin']
const adminDepartment: UserRole[] = ['admin', 'department_coordinator']
const teaching: UserRole[] = ['admin', 'department_coordinator', 'faculty']
const venue: UserRole[] = ['admin', 'department_coordinator', 'club_representative']
const signedIn: UserRole[] = ['admin', 'department_coordinator', 'faculty', 'club_representative']
export const primaryNavigation: NavigationEntry[] = [
  { id: 'overview', label: 'Overview', to: '/dashboard', icon: LayoutDashboard, roles: admin },
  { id: 'datasets', label: 'Datasets', to: '/datasets', icon: Database, roles: admin },
  { id: 'timetable', label: 'Timetable', to: '/timetable', icon: CalendarDays, roles: teaching },
  { id: 'rooms', label: 'Room Management', to: '/rooms', icon: Building2, roles: venue },
  { id: 'bookings', label: 'Bookings', to: '/bookings', icon: CalendarCheck2, roles: venue },
  { id: 'examinations', label: 'Examinations', to: '/examinations', icon: BookOpenCheck, roles: adminDepartment },
  { id: 'disruptions', label: 'Disruptions', to: '/disruptions', icon: ShieldAlert, roles: teaching },
  { id: 'assistant', label: 'Assistant', to: '/assistant', icon: Bot, roles: teaching },
  { id: 'analytics', label: 'Analytics', to: '/analytics', icon: BarChart3, roles: admin },
  { id: 'account', label: 'Account', to: '/account', icon: UserRound, roles: signedIn },
]

export const settingsNavigation: NavigationEntry = {
  id: 'settings',
  label: 'Settings',
  to: '/settings',
  icon: Settings2,
  roles: admin,
}

export function getNavigationForRole(role: UserRole): NavigationEntry[] {
  return [...primaryNavigation, settingsNavigation].filter((item) => item.roles.includes(role))
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
  '/account': 'Account',
}

