import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RequestCache } from '../src/api/requestCache.mjs'

test('deduplicates identical in-flight reads and reuses fresh cached data', async () => {
  const cache = new RequestCache()
  let calls = 0
  let resolveFetch
  const fetcher = () => {
    calls += 1
    return new Promise((resolve) => { resolveFetch = resolve })
  }

  const first = cache.request('/datasets/example/summary', 'GET', fetcher)
  const second = cache.request('/datasets/example/summary', 'GET', fetcher)
  await Promise.resolve()
  assert.equal(calls, 1)
  resolveFetch({ value: 4 })
  assert.deepEqual(await first, { value: 4 })
  assert.deepEqual(await second, { value: 4 })
  assert.deepEqual(await cache.request('/datasets/example/summary', 'GET', fetcher), { value: 4 })
  assert.equal(calls, 1)
})

test('expires cached reads using their resource lifetime', async () => {
  let now = 1_000
  let calls = 0
  const cache = new RequestCache(() => now)
  const fetcher = async () => ({ version: ++calls })

  assert.deepEqual(await cache.request('/datasets', 'GET', fetcher), { version: 1 })
  assert.deepEqual(await cache.request('/datasets', 'GET', fetcher), { version: 1 })
  now += 60_001
  assert.deepEqual(await cache.request('/datasets', 'GET', fetcher), { version: 2 })
})

test('invalidates reads affected by a successful write', async () => {
  const cache = new RequestCache()
  let calls = 0
  const fetcher = async () => ({ version: ++calls })
  await cache.request('/datasets/id/summary', 'GET', fetcher)
  await cache.request('/datasets/id/schedules/generate', 'POST', async () => ({ status: 'complete' }))
  assert.deepEqual(await cache.request('/datasets/id/summary', 'GET', fetcher), { version: 2 })
  assert.equal(calls, 2)
})

test('does not repopulate stale cache when a write finishes during an older read', async () => {
  const cache = new RequestCache()
  let resolveOld
  let calls = 0
  const oldRead = cache.request('/datasets/id/bookings', 'GET', () => new Promise((resolve) => { resolveOld = resolve }))
  await Promise.resolve()
  await cache.request('/datasets/id/booking-requests', 'POST', async () => ({ status: 'created' }))
  resolveOld([{ request_id: 'old' }])
  await oldRead

  const fresh = await cache.request('/datasets/id/bookings', 'GET', async () => ({ request_id: ++calls }))
  assert.deepEqual(fresh, { request_id: 1 })
  assert.equal(calls, 1)
})

test('does not cache failed reads and permits a clean retry', async () => {
  const cache = new RequestCache()
  let calls = 0
  await assert.rejects(cache.request('/datasets', 'GET', async () => {
    calls += 1
    throw new Error('temporary API failure')
  }), /temporary API failure/)
  assert.deepEqual(await cache.request('/datasets', 'GET', async () => {
    calls += 1
    return []
  }), [])
  assert.equal(calls, 2)
})
