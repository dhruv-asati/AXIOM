const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export type DatasetSummary = {
  id: string
  source_dataset_id: string
  institute: string
  created_at: string
}

export async function listDatasets(signal?: AbortSignal): Promise<DatasetSummary[]> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  const abortFromCaller = () => controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })
  if (signal?.aborted) controller.abort()
  try {
    const response = await fetch(`${API_URL}/datasets`, { signal: controller.signal })
    if (!response.ok) throw new Error('Could not load imported datasets')
    return await response.json() as DatasetSummary[]
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
