import { useState } from 'react'
import { Bell, Check, ChevronRight, Menu, Search, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { AnimatedLink } from '../ui/AnimatedLink'
import { SmoothInput } from '../ui/SmoothInput'
import { routeTitles } from './navigation'
import { UserProfile } from './UserProfile'
import { useDatasetContext } from '../../context/DatasetContext'
import { homeForRole, useAuth } from '../../auth/AuthContext'

type TopNavbarProps = {
  onMenuClick: () => void
  isMobileMenuOpen: boolean
}

export function TopNavbar({ onMenuClick, isMobileMenuOpen }: TopNavbarProps) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [showNotice, setShowNotice] = useState(false)
  const { datasets, selectedDatasetId, selectDataset, loading: datasetsLoading } = useDatasetContext()
  const title = routeTitles[pathname] ?? 'Page not found'

  return (
    <header className="top-navbar">
      <div className="navbar-leading">
        <button
          className="mobile-menu-button icon-button"
          type="button"
          aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isMobileMenuOpen}
          onClick={onMenuClick}
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="breadcrumbs" aria-label="Breadcrumb">
          <AnimatedLink to={user ? homeForRole(user.role) : '/'} variant="center">Campus</AnimatedLink>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">{title}</span>
        </div>
      </div>

      <div className="navbar-actions">
        <label className="dataset-switcher"><span>Dataset</span><select aria-label="Active dataset" value={selectedDatasetId} disabled={datasetsLoading || datasets.length === 0} onChange={(event) => selectDataset(event.target.value)}>
          {datasets.length === 0 && <option value="">None</option>}
          {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.source_dataset_id}</option>)}
        </select></label>
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <SmoothInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workspace"
            aria-label="Search workspace"
          />
        </label>
        <div className="notification-control">
          <button
            className={`icon-button notification-button${showNotice ? ' is-selected' : ''}`}
            type="button"
            aria-label="Notifications"
            aria-expanded={showNotice}
            onClick={() => setShowNotice((visible) => !visible)}
          >
            <Bell size={18} strokeWidth={1.8} />
          </button>
          {showNotice && (
            <div className="notification-popover" role="status">
              <div className="popover-title"><span>Notifications</span><Check size={15} /></div>
              <p>Notifications will appear here when they’re available.</p>
              <small>This workspace isn’t connected to a notification service yet.</small>
            </div>
          )}
        </div>
        <span className="navbar-divider" aria-hidden="true" />
        <UserProfile />
      </div>
    </header>
  )
}

import './TopNavbar.css'
