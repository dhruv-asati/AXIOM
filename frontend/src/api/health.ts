const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export async function checkApiHealth(): Promise<void> {
  const response = await fetch(`${API_URL}/health`)
  if (!response.ok) throw new Error('AXIOM API health check failed')
}
