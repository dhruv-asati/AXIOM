import { apiRequest } from './client'
import type { DatasetDetail, DatasetSummary } from '../types/api'

export type { DatasetSummary } from '../types/api'

export async function listDatasets(signal?: AbortSignal): Promise<DatasetSummary[]> {
  return apiRequest<DatasetSummary[]>('/datasets', { signal })
}

export async function getDataset(datasetId: string, signal?: AbortSignal): Promise<DatasetDetail> {
  return apiRequest<DatasetDetail>(`/datasets/${datasetId}`, { signal })
}

export async function uploadDataset(files: File[], replaceExisting = false): Promise<{ dataset_id: string; source_dataset_id: string; counts: Record<string, number> }> {
  const body = new FormData()
  files.forEach((file) => body.append('files', file, file.name))
  body.append('replace_existing', String(replaceExisting))
  return apiRequest('/datasets/import/upload', { method: 'POST', body })
}

export async function getDashboardSummary(datasetId: string, signal?: AbortSignal) {
  return apiRequest<import('../types/api').DashboardSummary>(`/datasets/${datasetId}/summary`, { signal })
}
