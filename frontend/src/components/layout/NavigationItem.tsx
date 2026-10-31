import { NavLink } from 'react-router-dom'
import type { NavigationEntry } from './navigation'

type NavigationItemProps = {
  item: NavigationEntry
  onNavigate?: () => void
}

export function NavigationItem({ item, onNavigate }: NavigationItemProps) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end
      onClick={onNavigate}
      className={({ isActive }) => `navigation-item${isActive ? ' is-active' : ''}`}
      title={item.label}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span>{item.label}</span>
    </NavLink>
  )
}
