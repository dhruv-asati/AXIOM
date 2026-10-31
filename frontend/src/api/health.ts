import { API_BASE_URL } from './config'

export async function checkApiHealth(signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/health`, { signal })
  if (!response.ok) throw new Error('AXIOM API health check failed')
}
