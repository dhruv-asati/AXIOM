import { useEffect, useState } from 'react'
import { AlertCircle, BarChart3 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { getDashboardSummary } from '../api/datasets'
import { useDatasetContext } from '../context/DatasetContext'
import type { DashboardSummary } from '../types/api'
import './Operations.css'
import { SkeletonCard, SkeletonPage, SkeletonStats } from '../components/ui/Skeleton'

export function AnalyticsPage() {
  const { selectedDatasetId } = useDatasetContext()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadedDatasetId, setLoadedDatasetId] = useState('')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setSummary(null); setLoadedDatasetId('')
    if (!selectedDatasetId) { setSummary(null); setLoading(false); return () => controller.abort() }
    setLoading(true); setError('')
    getDashboardSummary(selectedDatasetId, controller.signal).then((data) => { if (active) { setSummary(data); setLoadedDatasetId(selectedDatasetId) } }).catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Analytics unavailable')).finally(() => active && setLoading(false))
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId])
  return <div className="ops-page"><PageHeader eyebrow="CAMPUS INSIGHTS" title="Analytics" description="Dataset counts and utilisation calculated from persisted schedules. No synthetic metrics are shown."/>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15}/>{error}</div>}{loading && loadedDatasetId === selectedDatasetId && summary && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton"/>Refreshing analytics…</span>}
    {loading && selectedDatasetId && loadedDatasetId !== selectedDatasetId && <SkeletonPage label="Loading analytics"><SkeletonStats count={6}/><section className="ops-card-grid"><SkeletonCard/><SkeletonCard/></section></SkeletonPage>}
    {!loading && !error && !selectedDatasetId && <div className="ops-empty"><BarChart3 size={20}/><strong>Select or import a dataset</strong><span>Analytics are scoped to the active dataset.</span></div>}
    {loadedDatasetId === selectedDatasetId && summary && <><div className="ops-grid">{Object.entries(summary.counts).map(([name, value]) => <div className="ops-stat" key={name}><span>{name.replaceAll('_', ' ')}</span><strong>{value}</strong></div>)}</div><section className="ops-card"><div className="ops-card-heading"><div><h2>Schedule and bookings</h2><p>{summary.source_dataset_id} · {summary.institute}</p></div></div><div className="ops-grid"><div className="ops-stat"><span>Schedules</span><strong>{summary.schedule_count}</strong></div><div className="ops-stat"><span>Latest schedule</span><strong>{summary.latest_schedule?.status ?? 'None'}</strong></div><div className="ops-stat"><span>Room utilisation</span><strong>{summary.room_utilisation_percent === null ? 'Unavailable' : `${summary.room_utilisation_percent}%`}</strong><small>{summary.room_utilisation_definition}</small></div>{Object.entries(summary.booking_counts).map(([key, value]) => <div className="ops-stat" key={key}><span>Bookings {key.replace('_', ' ')}</span><strong>{value}</strong></div>)}</div></section></>}
  </div>
}
