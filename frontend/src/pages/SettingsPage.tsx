import { Settings2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { apiUrl } from '../api/client'
import { useDatasetContext } from '../context/DatasetContext'
import './Operations.css'
import { Skeleton } from '../components/ui/Skeleton'

export function SettingsPage() {
  const { selectedDataset, datasets, loading, error, refresh } = useDatasetContext()
  return <div className="ops-page"><PageHeader eyebrow="WORKSPACE" title="Settings" description="Connection and active dataset information for this AXIOM environment."/><section className="ops-card"><div className="ops-card-heading"><div><h2><Settings2 size={15}/> Service connection</h2><p>The API URL is configured with the frontend VITE_API_URL environment variable.</p></div></div><div className="ops-detail-grid"><div className="ops-detail"><span>Backend API</span><strong className="ops-mono">{apiUrl()}</strong></div><div className="ops-detail"><span>Dataset catalog</span><strong>{loading ? <Skeleton width={78} height={12}/> : error ? 'Unavailable' : `${datasets.length} datasets`}</strong></div><div className="ops-detail"><span>Active dataset</span><strong className="ops-mono">{loading ? <Skeleton width={120} height={12}/> : selectedDataset?.source_dataset_id ?? 'None selected'}</strong></div></div>{error && <div className="ops-message error" role="alert">{error}</div>}<button type="button" className="ops-button" onClick={() => void refresh()}>Refresh dataset catalog</button></section><div className="ops-callout">Authentication and user roles are not configured in this project. The app should be used only in a trusted development environment until access control is implemented.</div></div>
}
