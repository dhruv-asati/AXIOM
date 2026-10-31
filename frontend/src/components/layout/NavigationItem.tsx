import { AnimatedNavLink } from '../ui/AnimatedLink'
import type { NavigationEntry } from './navigation'

type NavigationItemProps = {
  item: NavigationEntry
  onNavigate?: () => void
}

export function NavigationItem({ item, onNavigate }: NavigationItemProps) {
  const Icon = item.icon

  return (
    <AnimatedNavLink
      to={item.to}
      end
      variant="underline"
      activeClassName="is-active"
      onClick={onNavigate}
      className="navigation-item"
      title={item.label}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span className="animated-link-label">{item.label}</span>
    </AnimatedNavLink>
  )
}
