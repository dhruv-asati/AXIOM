import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties } from 'react'
import { registerSpecularSurface } from './specularRenderer'
import './SpecularButton.css'

export type SpecularButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  shineSize?: number
  shineFade?: number
  thickness?: number
  glow?: number
  radius?: number
  tint?: string
  textColor?: string
}

export const SpecularButton = forwardRef<HTMLButtonElement, SpecularButtonProps>(function SpecularButton({
  className = '',
  type = 'button',
  shineSize = 145,
  shineFade = 18,
  thickness = 1.8,
  glow = 0.16,
  radius,
  tint,
  textColor,
  style,
  children,
  disabled,
  ...props
}, forwardedRef) {
  const elementRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = elementRef.current
    if (!element) return
    return registerSpecularSurface(element, { kind: 'button', shineSize, shineFade, thickness, glow, radius, tint, intensity: .5 })
  }, [shineSize, shineFade, thickness, glow, radius, tint])

  return <button
    {...props}
    ref={(element) => {
      elementRef.current = element
      if (typeof forwardedRef === 'function') forwardedRef(element)
      else if (forwardedRef) forwardedRef.current = element
    }}
    type={type}
    disabled={disabled}
    className={`specular-button${className ? ` ${className}` : ''}`}
    data-specular-manual=""
    style={{ ...style, ...(radius ? { borderRadius: radius } : {}), ...(tint ? { '--specular-tint': tint } as CSSProperties : {}), ...(textColor ? { color: textColor } : {}) }}
  >{children}</button>
})
