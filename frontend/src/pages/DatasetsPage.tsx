import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Database, LoaderCircle, UploadCloud } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { ApiError } from '../api/client'
import { invalidateApiCache } from '../api/client'
import { getDashboardSummary, uploadDataset } from '../api/datasets'
import { useDatasetContext } from '../context/DatasetContext'
import type { DashboardSummary } from '../types/api'
import { SkeletonStats, SkeletonTable } from '../components/ui/Skeleton'
import './Operations.css'

export function DatasetsPage() {
  const { datasets, selectedDatasetId, selectDataset, loading: datasetsLoading, error: datasetsError, refresh } = useDatasetContext()
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [allowReplace, setAllowReplace] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [summaryDatasetId, setSummaryDatasetId] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const summaryRequest = useRef<AbortController | null>(null)

  useEffect(() => () => summaryRequest.current?.abort(), [])

  const selectedDataset = datasets.find((dataset) => dataset.id === selectedDatasetId)
  const sortedDatasets = useMemo(() => [...datasets].sort((a, b) => a.source_dataset_id.localeCompare(b.source_dataset_id)), [datasets])

  const loadSummary = async (datasetId = selectedDatasetId) => {
    if (!datasetId) return
    summaryRequest.current?.abort()
    const controller = new AbortController()
    summaryRequest.current = controller
    invalidateApiCache(`/datasets/${datasetId}/summary`)
    setSummaryLoading(true)
    setSummary(null); setSummaryDatasetId('')
    try {
      const result = await getDashboardSummary(datasetId, controller.signal)
      if (!controller.signal.aborted) { setSummary(result); setSummaryDatasetId(datasetId) }
    } catch (cause) {
      if (!controller.signal.aborted) { setSummary(null); setError(cause instanceof Error ? cause.message : 'Could not load dataset statistics') }
    } finally {
      if (!controller.signal.aborted) setSummaryLoading(false)
    }
  }

  const submit = async (replaceExisting = false) => {
    if (!files.length || isUploading) return
    setIsUploading(true)
    setError('')
    setMessage('')
    setAllowReplace(false)
    try {
      const result = await uploadDataset(files, replaceExisting)
      await refresh()
      selectDataset(result.dataset_id)
      setFiles([])
      setMessage(`Imported ${result.source_dataset_id}. ${Object.entries(result.counts).map(([key, value]) => `${key}: ${value}`).join(' · ')}`)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.message.includes('replace_existing_required')) {
        setAllowReplace(true)
        setError('This source dataset ID already exists. Confirm below to update its records.')
      } else {
        setError(cause instanceof Error ? cause.message : 'Dataset import failed')
      }
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="ops-page">
      <PageHeader eyebrow="DATA MANAGEMENT" title="Datasets" description="Import, inspect, and select the campus dataset used by scheduling and booking workflows." />

      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Upload dataset files</h2><p>Choose one dataset JSON and any CSV supplements. Files are validated by the backend importer before records are written.</p></div></div>
        <div className="ops-fields">
          <label className="ops-field">JSON and CSV files
            <input type="file" accept=".json,.csv,application/json,text/csv" multiple disabled={isUploading} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
          </label>
          <button className="ops-button primary" type="button" disabled={!files.length || isUploading} onClick={() => void submit()}>
            {isUploading ? <LoaderCircle size={15} className="is-spinning" /> : <UploadCloud size={15} />}{isUploading ? 'Importing' : 'Import selected files'}
          </button>
        </div>
        {files.length > 0 && <div className="ops-file-list" style={{ marginTop: 12 }}>{files.map((file) => <span key={`${file.name}-${file.size}`} className="ops-file-chip">{file.name} · {(file.size / 1024).toFixed(1)} KB</span>)}</div>}
        {isUploading && <p className="ops-progress" role="status"><LoaderCircle size={14} /> Validating and importing. Larger datasets can take a little longer.</p>}
        {error && <div className="ops-message error" role="alert" style={{ marginTop: 12 }}><AlertCircle size={15} />{error}</div>}
        {message && <div className="ops-message success" role="status" style={{ marginTop: 12 }}><CheckCircle2 size={15} />{message}</div>}
        {allowReplace && <div className="ops-button-row" style={{ marginTop: 12 }}><button className="ops-button danger" type="button" disabled={isUploading} onClick={() => void submit(true)}>Confirm update existing dataset</button></div>}
      </section>

      <section className="ops-card">
        <div className="ops-card-heading"><div><h2>Imported datasets</h2><p>Dataset source IDs remain scoped in the database. Select one to use it throughout AXIOM.</p></div><button className="ops-button" type="button" onClick={() => void refresh()} disabled={datasetsLoading}><Database size={14} />Refresh</button></div>
        {datasetsLoading && sortedDatasets.length === 0 && <div role="status" aria-label="Loading imported datasets"><SkeletonTable rows={4} columns={5} /></div>}
        {datasetsError && <div className="ops-message error" role="alert">{datasetsError}<button className="ops-button" type="button" onClick={() => void refresh()}>Retry</button></div>}
        {!datasetsLoading && !datasetsError && sortedDatasets.length === 0 && <div className="ops-empty"><Database size={20} /><strong>No datasets imported</strong><span>Upload a JSON dataset above to begin scheduling.</span></div>}
        {sortedDatasets.length > 0 && <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Selected</th><th>Source dataset ID</th><th>Institute</th><th>Imported</th><th /></tr></thead><tbody>{sortedDatasets.map((dataset) => <tr key={dataset.id}>
          <td><input aria-label={`Select ${dataset.source_dataset_id}`} type="radio" checked={selectedDatasetId === dataset.id} onChange={() => { summaryRequest.current?.abort(); setSummaryLoading(false); selectDataset(dataset.id); setSummary(null); setSummaryDatasetId('') }} /></td>
          <td className="ops-mono">{dataset.source_dataset_id}</td><td>{dataset.institute}</td><td>{new Date(dataset.created_at).toLocaleString()}</td>
          <td><button className="ops-button" type="button" onClick={() => { selectDataset(dataset.id); void loadSummary(dataset.id) }}>View statistics</button></td>
        </tr>)}</tbody></table></div>}
      </section>

      {selectedDataset && <section className="ops-card">
        <div className="ops-card-heading"><div><h2>{selectedDataset.institute}</h2><p className="ops-mono">{selectedDataset.source_dataset_id}</p></div><button className="ops-button" type="button" onClick={() => void loadSummary()} disabled={summaryLoading}>{summaryLoading ? <LoaderCircle size={14} className="is-spinning" /> : <Database size={14} />}Load statistics</button></div>
        {summaryLoading && summaryDatasetId !== selectedDatasetId && <SkeletonStats count={6} />}
        {summaryDatasetId === selectedDatasetId && summary && <div className="ops-grid">{Object.entries(summary.counts).map(([key, value]) => <div className="ops-stat" key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{value}</strong></div>)}</div>}
        {summaryDatasetId === selectedDatasetId && summary && <div className="ops-button-row" style={{ marginTop: 14 }}><Link className="ops-button primary" to="/timetable">Generate or view timetable</Link></div>}
        {!summary && !summaryLoading && <p className="ops-inline-note">Statistics require the Stage 12 read API and current database migrations. Use Load statistics to retry.</p>}
      </section>}
    </div>
  )
}
