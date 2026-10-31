import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { TopNavbar } from './TopNavbar'

export function MainLayout() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const closeMobileMenu = () => setIsMobileMenuOpen(false)

  return (
    <div className="application-shell">
      <AppSidebar isOpen={isMobileMenuOpen} onNavigate={closeMobileMenu} />
      {isMobileMenuOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={closeMobileMenu}
        />
      )}
      <div className="workspace">
        <TopNavbar
          isMobileMenuOpen={isMobileMenuOpen}
          onMenuClick={() => setIsMobileMenuOpen((open) => !open)}
        />
        <main className="main-content" id="main-content">
          <div className="content-container"><Outlet /></div>
          <footer className="workspace-footer">
            <span>AXIOM <span className="footer-separator">/</span> Campus operations</span>
            <span>Built for a campus in motion</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
