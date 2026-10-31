import { ArrowUpRight } from 'lucide-react'
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { Link, NavLink, type LinkProps, type NavLinkProps } from 'react-router-dom'
import './AnimatedLink.css'

export type AnimatedLinkVariant = 'underline' | 'center' | 'reveal' | 'full'

type InternalAnimatedLinkProps = Omit<LinkProps, 'to'> & {
  to: LinkProps['to']
  href?: never
  variant?: AnimatedLinkVariant
  externalArrow?: never
}

type ExternalAnimatedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string
  to?: never
  variant?: AnimatedLinkVariant
  externalArrow?: boolean
}

export type AnimatedLinkProps = InternalAnimatedLinkProps | ExternalAnimatedLinkProps

function linkClass(variant: AnimatedLinkVariant, className?: string) {
  return ['animated-link', `animated-link--${variant}`, className].filter(Boolean).join(' ')
}

export function AnimatedLink(props: AnimatedLinkProps) {
  if ('href' in props && props.href) {
    const { href, variant = 'underline', className, externalArrow = true, target, rel, children, ...anchorProps } = props
    const safeRel = target === '_blank' ? [rel, 'noopener', 'noreferrer'].filter(Boolean).join(' ') : rel
    return (
      <a {...anchorProps} href={href} target={target} rel={safeRel} className={linkClass(variant, className)}>
        {children}
        {externalArrow && <ArrowUpRight className="animated-link-arrow" size={14} aria-hidden="true" />}
      </a>
    )
  }

  const { to, variant = 'underline', className, children, ...linkProps } = props as InternalAnimatedLinkProps
  return <Link {...linkProps} to={to} className={linkClass(variant, className)}>{children}</Link>
}

type AnimatedNavLinkProps = Omit<NavLinkProps, 'className' | 'children'> & {
  children: ReactNode
  className?: string
  variant?: AnimatedLinkVariant
  activeClassName?: string
}

export const AnimatedNavLink = forwardRef<HTMLAnchorElement, AnimatedNavLinkProps>(function AnimatedNavLink({
  children,
  className,
  variant = 'underline',
  activeClassName = 'is-route-active',
  ...props
}, ref) {
  return (
    <NavLink
      {...props}
      ref={ref}
      className={({ isActive }) => linkClass(variant, [className, isActive ? activeClassName : ''].filter(Boolean).join(' '))}
    >
      {children}
    </NavLink>
  )
})

