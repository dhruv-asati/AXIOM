import { useRef } from 'react'
import { useState } from 'react'
import { CircleUserRound, Layers3, LogOut } from 'lucide-react'
import { useNavigate, Outlet } from 'react-router-dom'
import { roleLabel, useAuth } from '../../auth/AuthContext'
import { useDatasetContext } from '../../context/DatasetContext'
import { FloatingMenu, FloatingMenuPanel, type FloatingMenuItem } from './FloatingMenu'
import { getNavigationForRole } from './navigation'
import { SpecularEffectsLayer } from '../ui/SpecularEffectsLayer'
import { clearAssistantMemorySession } from '../../lib/assistantMemory.mjs'
import '../ui/MagicBento.css'

export function MainLayout() {
  const { user, signOut } = useAuth()
  const shellRef = useRef<HTMLDivElement>(null)
  const { datasets, selectedDatasetId, selectDataset, loading: datasetsLoading, error: datasetsError } = useDatasetContext()
  const navigate = useNavigate()
  const [logoutError, setLogoutError] = useState('')

  async function handleSignOut() {
    setLogoutError('')
    try {
      await signOut()
      clearAssistantMemorySession()
      navigate('/', { replace: true })
    } catch {
      setLogoutError('Sign out could not reach AXIOM. Try again.')
    }
  }

  const roleItems: FloatingMenuItem[] = user ? getNavigationForRole(user.role).map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    href: item.to,
  })) : []
  const items: FloatingMenuItem[] = [
    ...roleItems,
    {
      id: 'dataset', label: 'Active dataset', icon: Layers3,
      panel: <FloatingMenuPanel title="Active dataset">
        <label className="floating-menu-dataset-select">Choose the dataset used across AXIOM
          <select aria-label="Active dataset" value={selectedDatasetId} disabled={datasetsLoading || datasets.length === 0} onChange={(event) => selectDataset(event.target.value)}>
            {datasets.length === 0 && <option value="">None available</option>}
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.source_dataset_id}</option>)}
          </select>
        </label>
        {datasetsError && <p className="floating-menu-panel-note" role="status">Dataset list unavailable. {datasetsError}</p>}
        {!datasetsError && datasets.length === 0 && <p className="floating-menu-panel-note">No datasets are available for this account.</p>}
      </FloatingMenuPanel>,
    },
    {
      id: 'account', label: 'Account', icon: CircleUserRound,
      panel: <FloatingMenuPanel title="Signed in">
        <div className="floating-menu-account">
          <strong>{user?.username ?? 'AXIOM user'}</strong>
          <span>{user ? roleLabel(user.role) : 'Workspace user'}{user?.department ? ` · ${user.department}` : ''}</span>
        </div>
        {logoutError && <p className="floating-menu-panel-note" role="alert">{logoutError}</p>}
      </FloatingMenuPanel>,
    },
    { id: 'sign-out', label: 'Sign out', icon: LogOut, tone: 'danger', onClick: () => void handleSignOut() },
  ]
  return (
    <div className="application-shell" ref={shellRef}>
      <SpecularEffectsLayer rootRef={shellRef} />
      <FloatingMenu items={items} />
      <main className="main-content" id="main-content">
        <div className="content-container"><Outlet /></div>
        <footer className="workspace-footer">
          <span>AXIOM <span className="footer-separator">/</span> Campus operations</span>
          <span>Built for a campus in motion</span>
        </footer>
      </main>
    </div>
  )
}
