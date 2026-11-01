import test from 'node:test'
import assert from 'node:assert/strict'
import { periodClockSlots, periodClockTime, periodForClockTime } from '../src/lib/timeSlots.ts'

const periods = [
  { id: 2, start: '09:00', end: '10:00' },
  { id: 3, start: '10:00', end: '11:00' },
  { id: 4, start: '11:00', end: '12:00' },
]

test('converts dataset period times to wheel values and retains period IDs', () => {
  assert.equal(periodClockTime(periods[1]), '10:00')
  assert.equal(periodForClockTime(periods, '11:00')?.id, 4)
  assert.deepEqual(periodClockSlots(periods, 'end'), ['10:00', '11:00', '12:00'])
})

test('ignores absent or malformed period times instead of inventing values', () => {
  assert.equal(periodClockTime({ id: 8 }), '')
  assert.deepEqual(periodClockSlots([{ id: 8 }, { id: 9, start: 'not-a-time' }]), [])
  assert.equal(periodForClockTime(periods, '08:30'), undefined)
})
