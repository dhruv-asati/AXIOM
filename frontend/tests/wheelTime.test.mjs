import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAllowedTimes, nearestAllowedTime, toMinutes, toTimeString } from '../src/lib/wheelTime.ts'

test('minute steps and min/max bounds produce only allowed wall-clock values', () => {
  const allowed = buildAllowedTimes({ minuteStep: 15, minTime: '09:30', maxTime: '10:30' })
  assert.deepEqual(allowed.map(toTimeString), ['09:30', '09:45', '10:00', '10:15', '10:30'])
})

test('fixed slots and disabled values cannot be selected', () => {
  const allowed = buildAllowedTimes({
    slots: ['09:00', '09:30', { value: '10:00', disabled: true }, '10:30'],
    disabledSlots: ['09:30'],
  })
  assert.deepEqual(allowed.map(toTimeString), ['09:00', '10:30'])
  assert.equal(nearestAllowedTime(toMinutes('10:00'), allowed), toMinutes('10:30'))
})

test('time values normalize to HH:mm and nearest ties resolve deterministically', () => {
  const allowed = [toMinutes('09:00'), toMinutes('09:10')]
  assert.equal(toTimeString(nearestAllowedTime(toMinutes('09:05'), allowed)), '09:00')
  assert.equal(toTimeString(toMinutes('9:07')), '09:07')
})
