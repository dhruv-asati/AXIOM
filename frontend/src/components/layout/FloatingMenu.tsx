import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Menu, X, type LucideIcon } from 'lucide-react'
import './FloatingMenu.css'

export type FloatingMenuCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
export const FLOATING_MENU_CORNER: FloatingMenuCorner = 'top-left'

export type FloatingMenuItem = {
  id: string
  label: string
  icon: LucideIcon
  href?: string
  onClick?: () => void
  badge?: string | number | boolean
  shortcut?: string
  pressed?: boolean
  panel?: ReactNode
  tone?: 'default' | 'danger'
}

export function FloatingMenu({ items }: { items: FloatingMenuItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activePanel, setActivePanel] = useState<string | null>(null)
  const menuId = 'axiom-floating-menu'

  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setActivePanel(null)
        setMobileOpen(false)
      }
    }
    const onMediaChange = () => setMobileOpen(false)
    document.addEventListener('pointerdown', closeOnOutside)
    media.addEventListener('change', onMediaChange)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside)
      media.removeEventListener('change', onMediaChange)
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      setActivePanel(null)
      setMobileOpen(false)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-menu-entry')) return
    const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-menu-entry]') ?? [])
    if (!buttons.length) return
    event.preventDefault()
    const currentIndex = buttons.indexOf(document.activeElement as HTMLElement)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? buttons.length - 1
        : event.key === 'ArrowDown' ? (currentIndex + 1 + buttons.length) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length
    buttons[nextIndex].focus()
  }

  const closeAfterAction = () => {
    setActivePanel(null)
    setMobileOpen(false)
  }

  return (
    <div className="floating-menu-root" ref={rootRef} data-corner={FLOATING_MENU_CORNER} onKeyDown={handleKeyDown}>
      <button
        className="floating-menu-mobile-toggle"
        type="button"
        aria-label={mobileOpen ? 'Close campus menu' : 'Open campus menu'}
        aria-expanded={mobileOpen}
        aria-controls={menuId}
        onClick={() => setMobileOpen((open) => !open)}
      >{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
      <nav id={menuId} className={`floating-menu${mobileOpen ? ' is-mobile-open' : ''}`} aria-label="Campus navigation">
        <div className="floating-menu-items">
          {items.map((item) => {
            const Icon = item.icon
            const tooltipId = `floating-menu-tooltip-${item.id}`
            const expanded = activePanel === item.id
            const badge = item.badge ? <span className="floating-menu-badge" aria-label={typeof item.badge === 'boolean' ? 'New' : `${item.badge} updates`}>{typeof item.badge === 'boolean' ? '' : item.badge}</span> : null
            const linkClass = ({ isActive }: { isActive: boolean }) => `floating-menu-button${isActive ? ' is-active' : ''}`
            return (
              <div className={`floating-menu-entry${expanded ? ' is-expanded' : ''}${item.href && location.pathname === item.href ? ' is-current' : ''}`} key={item.id}>
                {item.href ? (
                  <NavLink to={item.href} end className={linkClass} aria-label={item.label} aria-describedby={tooltipId} data-menu-entry onClick={closeAfterAction}>
                    <Icon size={23} strokeWidth={1.55} aria-hidden="true" /><span className="floating-menu-label">{item.label}</span>{badge}
                  </NavLink>
                ) : (
                  <button
                    className={`floating-menu-button${expanded ? ' is-active' : ''}${item.pressed ? ' is-pressed' : ''}${item.tone === 'danger' ? ' is-danger' : ''}`}
                    type="button"
                    aria-label={item.label}
                    aria-describedby={tooltipId}
                    aria-pressed={item.pressed}
                    aria-haspopup={item.panel ? 'dialog' : undefined}
                    aria-expanded={item.panel ? expanded : undefined}
                    data-menu-entry
                    onClick={() => {
                      if (item.panel) setActivePanel((active) => active === item.id ? null : item.id)
                      else { item.onClick?.(); closeAfterAction() }
                    }}
                  ><Icon size={23} strokeWidth={1.55} aria-hidden="true" /><span className="floating-menu-label">{item.label}</span>{badge}</button>
                )}
                <span className="floating-menu-tooltip" id={tooltipId} role="tooltip"><span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}</span>
                {item.panel && expanded && <div className="floating-menu-panel" role="dialog" aria-label={item.label} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setActivePanel(null) } }}>{item.panel}</div>}
              </div>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export type FloatingMenuPanelProps = { title: string; children: ReactNode }
export function FloatingMenuPanel({ title, children }: FloatingMenuPanelProps) {
  return <section className="floating-menu-panel-content"><h2>{title}</h2>{children}</section>
}
