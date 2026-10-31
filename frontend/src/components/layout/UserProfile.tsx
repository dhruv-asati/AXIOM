import { useState } from 'react'
import { ChevronDown, CircleUserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

export function UserProfile() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="profile-control">
      <button
        className="profile-button"
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="profile-avatar" aria-hidden="true">O</span>
        <span className="profile-copy"><strong>Om</strong><small>Campus admin</small></span>
        <ChevronDown className="profile-chevron" size={15} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-heading">
            <strong>Om</strong><span>Campus administrator</span>
          </div>
          <Link role="menuitem" to="/settings" onClick={() => setIsOpen(false)}>
            <CircleUserRound size={16} aria-hidden="true" /> Workspace settings
          </Link>
        </div>
      )}
    </div>
  )
}
