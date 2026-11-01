import { useCallback, useEffect, useRef } from 'react'
import type { UserRole } from '../../auth/AuthContext'
import JsBarcode from 'jsbarcode'
import { QRCodeSVG } from 'qrcode.react'
import './CampusIDBadge.css'

export type CampusIDBadgeProps = {
  displayName: string
  canonicalId: string
  roleKey: UserRole
  role: string
  affiliation: string
  organization?: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function CampusIDBadge({ displayName, canonicalId, roleKey, role, affiliation, organization }: CampusIDBadgeProps) {
  const hangerRef = useRef<HTMLDivElement>(null)
  const barcodeRef = useRef<SVGSVGElement>(null)
  const frameRef = useRef<number | null>(null)
  const angleRef = useRef(0)
  const velocityRef = useRef(0)
  const targetAngleRef = useRef(0)
  const offsetRef = useRef(0)
  const targetOffsetRef = useRef(0)
  const offsetVelocityRef = useRef(0)
  const dragRef = useRef<{ pointerId: number; startX: number; startAngle: number; lastX: number; lastTime: number } | null>(null)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    if (!barcodeRef.current || !canonicalId) return
    JsBarcode(barcodeRef.current, canonicalId, {
      format: 'CODE128',
      displayValue: false,
      lineColor: '#242522',
      background: '#eee9dc',
      width: 1.45,
      height: 45,
      margin: 8,
    })
  }, [canonicalId])

  const renderPose = useCallback((angle: number, offset = offsetRef.current) => {
    angleRef.current = clamp(angle, -14, 14)
    offsetRef.current = clamp(offset, -42, 42)
    if (hangerRef.current) hangerRef.current.style.transform = `translate3d(${offsetRef.current.toFixed(1)}px, 0, 0) rotate(${angleRef.current.toFixed(2)}deg)`
  }, [])

  const startSwing = useCallback(() => {
    if (frameRef.current !== null) return
    if (reducedMotionRef.current) {
      velocityRef.current = 0
      targetAngleRef.current = 0
      targetOffsetRef.current = 0
      renderPose(0, 0)
      frameRef.current = null
      return
    }
    let previousTime = 0
    const animate = (time: number) => {
      if (!previousTime) previousTime = time
      const dt = Math.min((time - previousTime) / 1000, 0.032)
      previousTime = time
      const acceleration = (targetAngleRef.current - angleRef.current) * 12 - velocityRef.current * 4.4
      velocityRef.current += acceleration * dt
      const offsetAcceleration = (targetOffsetRef.current - offsetRef.current) * 10 - offsetVelocityRef.current * 4.2
      offsetVelocityRef.current += offsetAcceleration * dt
      const nextAngle = angleRef.current + velocityRef.current * dt
      const nextOffset = offsetRef.current + offsetVelocityRef.current * dt
      if (Math.abs(nextAngle - targetAngleRef.current) < 0.16 && Math.abs(velocityRef.current) < 0.28 && Math.abs(nextOffset - targetOffsetRef.current) < 0.5 && Math.abs(offsetVelocityRef.current) < 0.5) {
        velocityRef.current = 0
        offsetVelocityRef.current = 0
        renderPose(targetAngleRef.current, targetOffsetRef.current)
        frameRef.current = null
        return
      }
      renderPose(nextAngle, nextOffset)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
  }, [renderPose])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      reducedMotionRef.current = query.matches
      if (query.matches && !dragRef.current) {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
        frameRef.current = null
        velocityRef.current = 0
        targetAngleRef.current = 0
        targetOffsetRef.current = 0
        renderPose(0, 0)
      }
    }
    update()
    query.addEventListener('change', update)
    return () => {
      query.removeEventListener('change', update)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [renderPose])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reducedMotionRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    velocityRef.current = 0
    offsetVelocityRef.current = 0
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startAngle: angleRef.current, lastX: event.clientX, lastTime: performance.now() }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag && drag.pointerId === event.pointerId) {
      const now = performance.now()
      const elapsed = Math.max(now - drag.lastTime, 1)
      velocityRef.current = clamp(((event.clientX - drag.lastX) / elapsed) * 1000 * 0.055, -95, 95)
      drag.lastX = event.clientX
      drag.lastTime = now
      const delta = event.clientX - drag.startX
      targetAngleRef.current = clamp(delta * 0.11, -14, 14)
      targetOffsetRef.current = clamp(delta * 0.2, -42, 42)
      renderPose(drag.startAngle + (targetAngleRef.current - drag.startAngle) * 0.7, targetOffsetRef.current * 0.7)
      return
    }
    if (event.pointerType === 'touch' || reducedMotionRef.current) return
    const stage = event.currentTarget.getBoundingClientRect()
    const anchor = hangerRef.current?.getBoundingClientRect()
    if (!anchor) return
    const dx = event.clientX - (anchor.left + anchor.width / 2)
    const dy = Math.max(150, event.clientY - stage.top)
    targetAngleRef.current = clamp(Math.atan2(dx, dy) * (180 / Math.PI) * 0.72, -11, 11)
    targetOffsetRef.current = clamp(dx * 0.075, -26, 26)
    startSwing()
  }

  const onStagePointerLeave = () => {
    if (dragRef.current) return
    targetAngleRef.current = 0
    targetOffsetRef.current = 0
    startSwing()
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    dragRef.current = null
    targetAngleRef.current = 0
    targetOffsetRef.current = 0
    startSwing()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    velocityRef.current = event.key === 'ArrowRight' ? 18 : -18
    targetAngleRef.current = 0
    targetOffsetRef.current = 0
    startSwing()
  }

  const initials = displayName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'AX'

  return (
    <div className="campus-badge-stage" role="group" aria-label="Interactive AXIOM campus ID badge. Move the pointer nearby to attract it, drag horizontally to swing the badge, or use the left and right arrow keys." tabIndex={0} onKeyDown={onKeyDown} onPointerMove={onStagePointerMove} onPointerLeave={onStagePointerLeave}>
      <div className="campus-badge-hanger" data-role={roleKey} ref={hangerRef}>
        <div className="campus-badge-lanyard" aria-hidden="true"><span>AXIOM</span></div>
        <div className="campus-badge-clip" aria-hidden="true"><span className="campus-badge-eyelet" /></div>
        <div
          className="campus-id-card"
          role="group"
          aria-label={`AXIOM identification card for ${displayName}; account ID ${canonicalId}`}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={() => { if (dragRef.current) { dragRef.current = null; startSwing() } }}
        >
          <div className="campus-id-card-inner">
            <header className="campus-id-header">
              <span className="campus-id-brand-mark" aria-hidden="true">A</span>
              <span className="campus-id-brand">AXIOM <small>· CAMPUS ACCESS</small></span>
              <span className="campus-id-card-type">IDENTIFICATION</span>
            </header>
            <div className="campus-id-identity">
              <div className="campus-id-avatar" aria-label={`Initials ${initials}`}>{initials}</div>
              <div className="campus-id-primary">
                <span className="campus-id-overline">CAMPUS MEMBER</span>
                <h2>{displayName || 'Not provided'}</h2>
                <p>{role}</p>
                <span className="campus-id-affiliation">{affiliation || 'Affiliation not provided'}</span>
              </div>
            </div>
            <div className="campus-id-codes">
              <div className="campus-id-barcode-block">
                <span className="campus-id-code-label">AXIOM ACCOUNT ID</span>
                <svg ref={barcodeRef} className="campus-id-barcode" aria-label={`Code 128 barcode for ${canonicalId}`} role="img" />
              </div>
              <div className="campus-id-qr-block">
                <QRCodeSVG value={canonicalId} size={84} level="H" includeMargin bgColor="#eee9dc" fgColor="#242522" aria-label={`QR code for ${canonicalId}`} />
                <span>SCAN ID</span>
              </div>
            </div>
            <footer className="campus-id-footer">
              <span>{organization || 'AXIOM · CAMPUS OPERATIONS'}</span>
              <span className="campus-id-chip">CAMPUS ID</span>
            </footer>
          </div>
        </div>
      </div>
      <p className="campus-badge-hint">Drag the badge to swing it <span aria-hidden="true">·</span> codes contain your AXIOM account ID only</p>
    </div>
  )
}
