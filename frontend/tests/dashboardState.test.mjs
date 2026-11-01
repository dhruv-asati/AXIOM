import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dashboardErrorState } from '../src/lib/dashboardState.mjs'

test('a failed load for a newly selected dataset clears stale dashboard values', () => {
  const state = dashboardErrorState('dataset-b', 'Request failed')
  assert.deepEqual(state, {
    summary: null,
    bookings: [],
    loadedDatasetId: 'dataset-b',
    apiAvailable: false,
    error: 'Request failed',
  })
})
