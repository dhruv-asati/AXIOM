export const ROLE_HOME = Object.freeze({
  admin: '/dashboard',
  department_coordinator: '/timetable',
  faculty: '/timetable',
  club_representative: '/bookings',
})

export const ROUTE_ROLES = Object.freeze({
  admin: Object.freeze(['admin']),
  adminDepartment: Object.freeze(['admin', 'department_coordinator']),
  teaching: Object.freeze(['admin', 'department_coordinator', 'faculty']),
  venue: Object.freeze(['admin', 'department_coordinator', 'club_representative']),
  signedIn: Object.freeze(['admin', 'department_coordinator', 'faculty', 'club_representative']),
})

export function homeForRole(role) {
  return ROLE_HOME[role] ?? '/login'
}

export function canAccessRole(role, roles) {
  return roles.includes(role)
}

export function canApproveDepartmentLabs(role) {
  return role === 'department_coordinator'
}

export function canReviewClassMoveBookings(role) {
  return role === 'admin'
}
