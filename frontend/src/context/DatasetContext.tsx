import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { listDatasets, type DatasetSummary } from '../api/datasets'
import { invalidateApiCache } from '../api/client'

type DatasetContextValue = {
  datasets: DatasetSummary[]
  selectedDatasetId: string
  selectedDataset: DatasetSummary | undefined
  loading: boolean
  error: string
  refresh: () => Promise<void>
  selectDataset: (id: string) => void
}

const DatasetContext = createContext<DatasetContextValue | null>(null)

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [selectedDatasetId, setSelectedDatasetId] = useState(() => localStorage.getItem('axiom.datasetId') ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refreshController = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    refreshController.current?.abort()
    const controller = new AbortController()
    refreshController.current = controller
    invalidateApiCache('/datasets')
    setLoading(true)
    setError('')
    try {
      const result = await listDatasets(controller.signal)
      setDatasets(result)
      setSelectedDatasetId((current) => {
        const next = result.some((dataset) => dataset.id === current) ? current : result[0]?.id ?? ''
        if (next) localStorage.setItem('axiom.datasetId', next)
        else localStorage.removeItem('axiom.datasetId')
        return next
      })
    } catch (cause) {
      if (controller.signal.aborted) return
      setError(cause instanceof Error ? cause.message : 'Could not load datasets')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => refreshController.current?.abort()
  }, [refresh])

  const selectDataset = useCallback((id: string) => {
    setSelectedDatasetId(id)
    if (id) localStorage.setItem('axiom.datasetId', id)
    else localStorage.removeItem('axiom.datasetId')
  }, [])

  const value = useMemo(() => ({
    datasets, selectedDatasetId,
    selectedDataset: datasets.find((dataset) => dataset.id === selectedDatasetId),
    loading, error, refresh, selectDataset,
  }), [datasets, selectedDatasetId, loading, error, refresh, selectDataset])

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>
}

export function useDatasetContext() {
  const context = useContext(DatasetContext)
  if (!context) throw new Error('useDatasetContext must be used inside DatasetProvider')
  return context
}
