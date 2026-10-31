const configuredApiUrl = import.meta.env.VITE_API_URL
const defaultApiUrl = import.meta.env.PROD ? '/api/v1' : 'http://localhost:8000/api/v1'

export const API_BASE_URL = (configuredApiUrl ?? defaultApiUrl).replace(/\/$/, '')
