import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, RefreshCw, RotateCcw, Save, Settings2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { apiUrl, invalidateApiCache } from '../api/client'
import { getDataset } from '../api/datasets'
import { resetDemoData, updatePriorityOrder } from '../api/resources'
import { useDatasetContext } from '../context/DatasetContext'
import type { DatasetDetail } from '../types/api'
import './Operations.css'
import { Skeleton } from '../components/ui/Skeleton'

export function SettingsPage() {
  const { selectedDataset, selectedDatasetId, datasets, loading, error, refresh } = useDatasetContext()
  const [detail, setDetail] = useState<DatasetDetail | null>(null)
  const [priorityOrder, setPriorityOrder] = useState<string[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    if (!selectedDatasetId) { setDetail(null); setPriorityOrder([]); return () => controller.abort() }
    setDetail(null)
    setPriorityOrder([])
    setActionError('')
    setNotice('')
    setLoadingDetail(true)
    getDataset(selectedDatasetId, controller.signal)
      .then((data) => { if (active) { setDetail(data); setPriorityOrder([...data.priority_order]) } })
      .catch((cause) => { if (active && !controller.signal.aborted) setActionError(cause instanceof Error ? cause.message : 'Dataset settings unavailable') })
      .finally(() => { if (active) setLoadingDetail(false) })
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId])

  const movePriority = (index: number, offset: number) => {
    const next = index + offset
    if (next < 0 || next >= priorityOrder.length) return
    setPriorityOrder((current) => {
      const copy = [...current]
      ;[copy[index], copy[next]] = [copy[next], copy[index]]
      return copy
    })
  }

  const savePriorityOrder = async () => {
    if (!selectedDatasetId) return
    setSavingOrder(true); setActionError(''); setNotice('')
    try {
      const result = await updatePriorityOrder(selectedDatasetId, priorityOrder)
      setPriorityOrder(result.priority_order)
      setNotice('Booking priority order saved.')
      invalidateApiCache()
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Priority order could not be saved') }
    finally { setSavingOrder(false) }
  }

  const resetDatasetDemo = async () => {
    if (!selectedDatasetId || !window.confirm('Reset demo activity for this dataset? This removes user-created booking requests, generated schedules and repair proposals. Imported dataset records and imported requests are preserved.')) return
    setResetting(true); setActionError(''); setNotice('')
    try {
      await resetDemoData(selectedDatasetId)
      invalidateApiCache()
      await refresh()
      setNotice('Demo activity reset. Imported dataset records and source requests were preserved.')
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Demo data could not be reset') }
    finally { setResetting(false) }
  }

  const priorityChanged = detail && priorityOrder.some((category, index) => category !== detail.priority_order[index])
  return <div className="ops-page">
    <PageHeader eyebrow="WORKSPACE" title="Settings" description="Configure the active dataset's booking priority and prepare a clean demonstration." />
    {actionError && <div className="ops-message error" role="alert">{actionError}</div>}
    {notice && <div className="ops-message success" role="status">{notice}</div>}
    <section className="ops-card">
      <div className="ops-card-heading"><div><h2><Settings2 size={15} /> Service connection</h2><p>Client settings are public configuration. Database credentials remain on the backend.</p></div></div>
      <div className="ops-detail-grid">
        <div className="ops-detail"><span>Backend API</span><strong className="ops-mono">{apiUrl()}</strong></div>
        <div className="ops-detail"><span>Dataset catalog</span><strong>{loading ? <Skeleton width={78} height={12} /> : error ? 'Unavailable' : `${datasets.length} datasets`}</strong></div>
        <div className="ops-detail"><span>Active dataset</span><strong className="ops-mono">{loading ? <Skeleton width={120} height={12} /> : selectedDataset?.source_dataset_id ?? 'None selected'}</strong></div>
      </div>
      {error && <div className="ops-message error" role="alert">{error}</div>}
      <button type="button" className="ops-button" onClick={() => void refresh()}><RefreshCw size={14} /> Refresh dataset catalog</button>
    </section>

    <section className="ops-card">
      <div className="ops-card-heading"><div><h2>Booking priority</h2><p>Move categories to change how the deterministic booking engine orders requests. Changes apply to the selected dataset.</p></div></div>
      {!selectedDatasetId ? <div className="ops-empty"><strong>Select a dataset</strong><span>Choose a dataset in the top bar to configure its priority order.</span></div>
        : loadingDetail ? <div className="ops-callout">Loading dataset priority…</div>
          : priorityOrder.length === 0 ? <div className="ops-callout">No priority categories are available for this dataset.</div>
            : <><ol className="priority-order-list">{priorityOrder.map((category, index) => <li key={category}><span className="priority-order-rank">{String(index + 1).padStart(2, '0')}</span><strong>{category.replaceAll('_', ' ')}</strong><span className="priority-order-actions"><button className="ops-button" type="button" aria-label={`Move ${category} earlier`} title="Move earlier" disabled={index === 0} onClick={() => movePriority(index, -1)}><ArrowUp size={14} /></button><button className="ops-button" type="button" aria-label={`Move ${category} later`} title="Move later" disabled={index === priorityOrder.length - 1} onClick={() => movePriority(index, 1)}><ArrowDown size={14} /></button></span></li>)}</ol>
              <button type="button" className="ops-button primary" disabled={!priorityChanged || savingOrder} onClick={() => void savePriorityOrder()}>{savingOrder ? <RefreshCw size={14} /> : <Save size={14} />}{savingOrder ? 'Saving…' : 'Save priority order'}</button>
            </>}
    </section>

    <section className="ops-card">
      <div className="ops-card-heading"><div><h2>Demo reset</h2><p>Remove generated schedules, repair proposals and user-created venue activity for the selected dataset. Source dataset records and imported booking requests stay in place.</p></div></div>
      <button type="button" className="ops-button danger" disabled={!selectedDatasetId || resetting} onClick={() => void resetDatasetDemo()}>{resetting ? <RefreshCw size={14} /> : <RotateCcw size={14} />}{resetting ? 'Resetting…' : 'Reset demo activity'}</button>
    </section>
  </div>
}
