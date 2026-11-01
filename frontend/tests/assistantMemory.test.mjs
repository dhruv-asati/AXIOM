import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAssistantMemorySession, getAssistantMemoryKey, readAssistantMemory, rememberAssistantContext, removeAssistantMemoryItem } from '../src/lib/assistantMemory.mjs'
import { getAssistantAutocompleteSuggestions } from '../src/components/assistant/assistantAutocomplete.mjs'

function memoryStore() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
    [Symbol.iterator]: function* () { yield* values.keys() },
    values,
  }
}

test('memory is isolated by authenticated user and dataset', () => {
  assert.notEqual(getAssistantMemoryKey('user-a', 'dataset-a'), getAssistantMemoryKey('user-b', 'dataset-a'))
  assert.notEqual(getAssistantMemoryKey('user-a', 'dataset-a'), getAssistantMemoryKey('user-a', 'dataset-b'))
})

test('remembers concise request context without retaining credentials or full messages', () => {
  const items = rememberAssistantContext([], {
    text: 'Please book a venue for Robotics Club on Friday from 10:00 to 12:00. password: abc123',
    mode: 'booking', department: 'CSE', now: 1000, idFactory: (() => { let id = 0; return () => `item-${++id}` })(),
  })
  assert.ok(items.some((item) => item.kind === 'organization' && item.value === 'Robotics Club'))
  assert.ok(items.some((item) => item.kind === 'department' && item.value === 'CSE'))
  assert.ok(items.some((item) => item.kind === 'date' && /Friday/.test(item.value)))
  assert.ok(items.some((item) => item.kind === 'time' && /10:00.*12:00/.test(item.value)))
  assert.ok(items.every((item) => !/abc123|password/i.test(item.value)))
  assert.ok(items.every((item) => item.value !== 'Please book a venue for Robotics Club on Friday from 10:00 to 12:00.'))
})

test('memory expires stale items, can remove one item and clears only its namespace on logout', () => {
  const store = memoryStore()
  const key = getAssistantMemoryKey('user-a', 'dataset-a')
  store.setItem(key, JSON.stringify({ items: [{ id: 'old', kind: 'topic', label: 'Topic', value: 'Old', updatedAt: 1 }], enabled: false }))
  store.setItem('axiom.assistantMemory.user-b.dataset-a', '{}')
  store.setItem('other.session', 'keep')
  assert.equal(readAssistantMemory(store, key, 4 * 60 * 60 * 1000 + 2).items.length, 0)
  const items = [{ id: '1' }, { id: '2' }]
  assert.deepEqual(removeAssistantMemoryItem(items, '1'), [{ id: '2' }])
  clearAssistantMemorySession(store)
  assert.equal(store.values.has(key), false)
  assert.equal(store.values.has('axiom.assistantMemory.user-b.dataset-a'), false)
  assert.equal(store.values.get('other.session'), 'keep')
})

test('memory can be disabled and role-restricted booking completions are not suggested', () => {
  const stored = [
    { id: '1', kind: 'organization', label: 'Organization', value: 'Robotics Club', updatedAt: Date.now() },
    { id: '2', kind: 'date', label: 'Date', value: 'Friday', updatedAt: Date.now() },
    { id: '3', kind: 'time', label: 'Time range', value: 'from 10:00 to 12:00', updatedAt: Date.now() },
  ]
  assert.equal(getAssistantAutocompleteSuggestions('Book a room', 'booking', 'faculty', stored).length, 0)
  const suggestions = getAssistantAutocompleteSuggestions('Book a room', 'booking', 'department_coordinator', stored)
  assert.match(suggestions[0].text, /Book a room.*on \[day\].*from \[start time\]/)
  const followUps = getAssistantAutocompleteSuggestions('Now do the same', 'booking', 'department_coordinator', stored)
  assert.equal(followUps.some((item) => /Robotics Club/.test(item.text)), true)
  assert.equal(followUps.some((item) => /Friday from 10:00 to 12:00/.test(item.text)), true)
  assert.equal(getAssistantAutocompleteSuggestions('Now do the same', 'booking', 'department_coordinator', []).length, 0)
})

test('disruption completions use only the existing disruption parser capability', () => {
  const suggestions = getAssistantAutocompleteSuggestions('Room B-204 is closed', 'disruption', 'faculty')
  assert.equal(suggestions.length, 1)
  assert.match(suggestions[0].text, /on \[day\].*periods \[periods\].*because \[reason\]/)
})
