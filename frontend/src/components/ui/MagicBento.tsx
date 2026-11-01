import { createElement, type HTMLAttributes, type ReactNode, type PointerEvent } from 'react'

export type MagicBentoProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div'
  children: ReactNode
  tone?: 'spotlight' | 'layered' | 'action' | 'data'
}

/** Small, theme-driven spotlight surface for selected high-value operational content. */
export function MagicBento({ as = 'article', className = '', children, tone = 'spotlight', onPointerMove, onPointerLeave, ...props }: MagicBentoProps) {
  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    event.currentTarget.style.setProperty('--bento-x', `${event.clientX - rect.left}px`)
    event.currentTarget.style.setProperty('--bento-y', `${event.clientY - rect.top}px`)
    onPointerMove?.(event)
  }
  const handlePointerLeave = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty('--bento-x')
    event.currentTarget.style.removeProperty('--bento-y')
    onPointerLeave?.(event)
  }

  return createElement(as, {
    ...props,
    className: `magic-bento magic-bento-${tone}${className ? ` ${className}` : ''}`,
    onPointerMove: handlePointerMove,
    onPointerLeave: handlePointerLeave,
    children,
  })
}
