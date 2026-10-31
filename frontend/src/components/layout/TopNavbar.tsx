import { useState } from 'react'
import { Bell, Check, ChevronRight, Menu, Search, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { routeTitles } from './navigation'
import { UserProfile } from './UserProfile'

type TopNavbarProps = {
  onMenuClick: () => void
  isMobileMenuOpen: boolean
}

export function TopNavbar({ onMenuClick, isMobileMenuOpen }: TopNavbarProps) {
  const { pathname } = useLocation()
  const [search, setSearch] = useState('')
  const [showNotice, setShowNotice] = useState(false)
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
          <Link to="/dashboard">Campus</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">{title}</span>
        </div>
      </div>

      <div className="navbar-actions">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
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
