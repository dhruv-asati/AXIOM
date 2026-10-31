import { useState } from 'react'
import { ChevronDown, CircleUserRound, LogOut } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { roleLabel, useAuth } from '../../auth/AuthContext'

export function UserProfile() {
  const [isOpen, setIsOpen] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const label = user ? roleLabel(user.role) : 'Workspace user'
  async function logout() {
    setLogoutError('')
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch {
      setLogoutError('Sign out could not reach AXIOM. Try again.')
    }
  }

  return (
    <div className="profile-control">
      <button
        className="profile-button"
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="profile-avatar" aria-hidden="true">{user?.username.slice(0, 1).toUpperCase() ?? 'A'}</span>
        <span className="profile-copy"><strong>{user?.username ?? 'AXIOM user'}</strong><small>{label}</small></span>
        <ChevronDown className="profile-chevron" size={15} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="profile-menu" role="menu">
          <div className="profile-menu-heading">
            <strong>{user?.username}</strong><span>{label}{user?.department ? ` · ${user.department}` : ''}</span>
          </div>
          {user?.role === 'admin' && <Link role="menuitem" to="/settings" onClick={() => setIsOpen(false)}><CircleUserRound size={16} aria-hidden="true" /> Workspace settings</Link>}
          <button className="profile-logout" role="menuitem" type="button" onClick={() => void logout()}><LogOut size={16} aria-hidden="true" /> Sign out</button>
          {logoutError && <span className="profile-logout-error" role="alert">{logoutError}</span>}
        </div>
      )}
    </div>
  )
}
