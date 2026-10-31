import type { UserRole } from './AuthContext'

export const ROLE_HOME: Readonly<Record<UserRole, string>>
export const ROUTE_ROLES: Readonly<{
  admin: readonly UserRole[]
  adminDepartment: readonly UserRole[]
  teaching: readonly UserRole[]
  venue: readonly UserRole[]
  signedIn: readonly UserRole[]
}>
export function homeForRole(role: UserRole): string
export function canAccessRole(role: UserRole, roles: readonly UserRole[]): boolean
export function canApproveDepartmentLabs(role: UserRole): boolean
export function canReviewClassMoveBookings(role: UserRole): boolean
