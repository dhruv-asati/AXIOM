import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessRole, canApproveDepartmentLabs, canReviewClassMoveBookings, homeForRole, ROUTE_ROLES } from '../src/auth/roleAccess.mjs'

test('each official role lands on its relevant existing workspace', () => {
  assert.equal(homeForRole('admin'), '/dashboard')
  assert.equal(homeForRole('department_coordinator'), '/timetable')
  assert.equal(homeForRole('faculty'), '/timetable')
  assert.equal(homeForRole('club_representative'), '/bookings')
  assert.equal(homeForRole('unknown'), '/login')
})

test('role route policies expose only appropriate workspace sections', () => {
  assert.equal(canAccessRole('club_representative', ROUTE_ROLES.venue), true)
  assert.equal(canAccessRole('club_representative', ROUTE_ROLES.teaching), false)
  assert.equal(canAccessRole('faculty', ROUTE_ROLES.admin), false)
  assert.equal(canAccessRole('department_coordinator', ROUTE_ROLES.adminDepartment), true)
})

test('the authenticated Account page is available to each AXIOM role', () => {
  for (const role of ['admin', 'department_coordinator', 'faculty', 'club_representative']) {
    assert.equal(canAccessRole(role, ROUTE_ROLES.signedIn), true, `${role} should be able to view their own account`)
  }
})

test('approval controls are visible only to their authorized roles', () => {
  assert.equal(canApproveDepartmentLabs('department_coordinator'), true)
  assert.equal(canApproveDepartmentLabs('admin'), false)
  assert.equal(canApproveDepartmentLabs('faculty'), false)
  assert.equal(canApproveDepartmentLabs('club_representative'), false)
  assert.equal(canReviewClassMoveBookings('admin'), true)
  assert.equal(canReviewClassMoveBookings('department_coordinator'), false)
  assert.equal(canReviewClassMoveBookings('faculty'), false)
  assert.equal(canReviewClassMoveBookings('club_representative'), false)
})
