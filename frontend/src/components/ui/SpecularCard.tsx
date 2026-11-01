import { createElement, useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { registerSpecularSurface } from './specularRenderer'

export type SpecularCardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div'
  children?: ReactNode
  shineSize?: number
  shineFade?: number
  thickness?: number
  glow?: number
  radius?: number
  tint?: string
}

export function SpecularCard({ as = 'article', className = '', children, shineSize = 190, shineFade = 24, thickness = 1, glow = .065, radius, tint, ...props }: SpecularCardProps) {
  const elementRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    return registerSpecularSurface(element, { kind: 'card', shineSize, shineFade, thickness, glow, radius, tint, intensity: .22 })
  }, [shineSize, shineFade, thickness, glow, radius, tint])
  return createElement(as, {
    ...props,
    ref: elementRef,
    className: `specular-card magic-bento magic-bento-spotlight${className ? ` ${className}` : ''}`,
    'data-specular-manual': '',
    children,
  })
}
