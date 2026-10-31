function cacheLifetime(path) {
  const routePath = path.split('?', 1)[0]
  if (routePath === '/datasets') return 60_000
  if (/^\/datasets\/[^/]+$/.test(routePath)) return 5 * 60_000
  if (routePath.endsWith('/assignments')) return 2 * 60_000
  if (routePath.endsWith('/examinations')) return 60_000
  if (routePath.endsWith('/schedules') || routePath.endsWith('/schedule-history')) return 15_000
  if (routePath.endsWith('/rooms')) return 15_000
  if (routePath.endsWith('/summary')) return 10_000
  if (routePath.endsWith('/bookings') || routePath.endsWith('/booking-outcomes')) return 2_000
  if (routePath.endsWith('/repair-proposals')) return 5_000
  return 0
}

export class RequestCache {
  constructor(now = Date.now) {
    this.now = now
    this.values = new Map()
    this.pending = new Map()
    this.revision = 0
  }

  invalidate(prefix) {
    this.revision += 1
    this.pending.clear()
    if (!prefix) {
      this.values.clear()
      return
    }
    for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key)
  }

  async request(path, method, fetcher, signal) {
    const key = path
    const requestRevision = this.revision
    if (method === 'GET') {
      const cached = this.values.get(key)
      if (cached && cached.expiresAt > this.now()) return cached.value
      if (cached) this.values.delete(key)
      if (!signal) {
        const pending = this.pending.get(key)
        if (pending) return pending
      }
    }

    const request = Promise.resolve().then(fetcher).then((value) => {
      if (method === 'GET') {
        const ttl = cacheLifetime(path)
        if (ttl > 0 && requestRevision === this.revision) {
          this.values.set(key, { value, expiresAt: this.now() + ttl })
        }
      } else {
        this.invalidateAfterWrite(path)
      }
      return value
    })
    if (method === 'GET' && !signal) {
      this.pending.set(key, request)
      void request.finally(() => { if (this.pending.get(key) === request) this.pending.delete(key) }).catch(() => undefined)
    }
    return request
  }

  invalidateAfterWrite(path) {
    if (path.startsWith('/datasets/import')) {
      this.invalidate()
      return
    }
    const datasetId = path.match(/^\/datasets\/([^/]+)/)?.[1]
    if (datasetId) this.invalidate('/datasets')
  }
}

export function invalidateAfterWrite(cache, path) {
  cache.invalidateAfterWrite(path)
}
