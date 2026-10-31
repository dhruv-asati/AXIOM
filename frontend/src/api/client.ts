import { RequestCache } from './requestCache.mjs'

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '')
const responseCache = new RequestCache()

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function invalidateApiCache(prefix?: string): void {
  responseCache.invalidate(prefix)
}

export function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  return responseCache.request(path, method, () => performRequest<T>(path, init), init.signal ?? undefined)
}

async function performRequest<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: init.body instanceof FormData
        ? init.headers
        : { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Cannot reach the AXIOM API. Check that the backend is running and retry.')
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json() as { detail?: unknown }
      if (typeof body.detail === 'string') message = body.detail
      else if (body.detail !== undefined) message = JSON.stringify(body.detail)
    } catch {
      // Keep the status message if the server did not return JSON.
    }
    throw new ApiError(response.status, message)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

export function apiUrl(): string {
  return API_URL
}
