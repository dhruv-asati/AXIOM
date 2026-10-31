import { Link } from 'react-router-dom'
import { NavigationItem } from './NavigationItem'
import { primaryNavigation, settingsNavigation } from './navigation'

type AppSidebarProps = {
  isOpen: boolean
  onNavigate: () => void
}

export function AppSidebar({ isOpen, onNavigate }: AppSidebarProps) {
  return (
    <aside className={`app-sidebar${isOpen ? ' is-open' : ''}`} aria-label="Main navigation">
      <Link className="brand-lockup" to="/dashboard" onClick={onNavigate} aria-label="AXIOM overview">
        <span className="brand-symbol" aria-hidden="true">A</span>
        <span className="brand-wordmark">AXIOM<span className="brand-period">.</span></span>
      </Link>

      <div className="sidebar-section-label">CAMPUS WORKSPACE</div>
      <nav className="primary-navigation" aria-label="Campus workspace">
        {primaryNavigation.map((item) => (
          <NavigationItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-section-label">PREFERENCES</div>
        <NavigationItem item={settingsNavigation} onNavigate={onNavigate} />
        <div className="sidebar-footnote">
          <span className="sidebar-footnote-mark" aria-hidden="true">A</span>
          <span><strong>Campus, in sync.</strong><small>Scheduling workspace</small></span>
        </div>
      </div>
    </aside>
  )
}
