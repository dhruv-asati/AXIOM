import { useEffect, type RefObject } from 'react'
import { attachSpecularCanvas, observeSpecularSurfaces } from './specularRenderer'
import './SpecularEffects.css'

export function SpecularEffectsLayer({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.specular-effects-canvas')
    if (!canvas) return undefined
    return attachSpecularCanvas(canvas)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    try { return observeSpecularSurfaces(root) } catch { return undefined }
  }, [rootRef])

  return <canvas className="specular-effects-canvas" aria-hidden="true" />
}
