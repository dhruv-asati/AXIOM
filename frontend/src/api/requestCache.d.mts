export class RequestCache {
  constructor(now?: () => number)
  invalidate(prefix?: string): void
  request<T>(path: string, method: string, fetcher: () => Promise<T>, signal?: AbortSignal): Promise<T>
  invalidateAfterWrite(path: string): void
}
