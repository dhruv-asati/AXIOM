import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref, type TextareaHTMLAttributes } from 'react'
import { gsap } from 'gsap'
import './SmoothInput.css'

type SmoothTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/** Multiline counterpart to SmoothInput. Measurement mirrors native wrapping and scrolling. */
export const SmoothTextarea = forwardRef<HTMLTextAreaElement, SmoothTextareaProps>(function SmoothTextarea({
  className,
  style,
  onChange,
  onSelect,
  onClick,
  onKeyUp,
  onFocus,
  onBlur,
  onScroll,
  onCompositionEnd,
  disabled,
  readOnly,
  ...props
}, forwardedRef) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const caretRef = useRef<HTMLSpanElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const [focused, setFocused] = useState(false)
  const [collapsedSelection, setCollapsedSelection] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)

  const setTextareaRef = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node
    assignRef(forwardedRef, node)
  }, [forwardedRef])

  const measureCaret = useCallback(() => {
    const textarea = textareaRef.current
    const caret = caretRef.current
    if (!textarea || !caret) return

    const start = textarea.selectionStart
    const isCollapsed = start === textarea.selectionEnd
    setCollapsedSelection(isCollapsed)
    if (!focused || !isCollapsed || disabled || readOnly || document.activeElement !== textarea) {
      gsap.to(caret, { autoAlpha: 0, duration: reducedMotion ? 0 : 0.08, overwrite: true })
      return
    }

    const computed = window.getComputedStyle(textarea)
    const bounds = textarea.getBoundingClientRect()
    const mirror = document.createElement('div')
    Object.assign(mirror.style, {
      position: 'fixed',
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      boxSizing: computed.boxSizing,
      padding: computed.padding,
      border: computed.border,
      font: computed.font,
      letterSpacing: computed.letterSpacing,
      wordSpacing: computed.wordSpacing,
      lineHeight: computed.lineHeight,
      textIndent: computed.textIndent,
      textTransform: computed.textTransform,
      textAlign: computed.textAlign,
      tabSize: computed.tabSize,
      whiteSpace: computed.whiteSpace,
      overflowWrap: computed.overflowWrap === 'normal' ? 'break-word' : computed.overflowWrap,
      overflow: 'hidden',
      visibility: 'hidden',
      pointerEvents: 'none',
    })
    const before = textarea.value.slice(0, start)
    mirror.textContent = before
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    mirror.append(marker)
    document.body.append(mirror)

    const markerBounds = marker.getBoundingClientRect()
    const fontSize = Number.parseFloat(computed.fontSize) || 16
    const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.35
    const x = markerBounds.left - bounds.left - textarea.scrollLeft
    const y = markerBounds.top - bounds.top - textarea.scrollTop
    const visible = x >= 0 && x <= textarea.clientWidth && y >= 0 && y <= textarea.clientHeight
    mirror.remove()

    const prefersMotionReduction = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gsap.to(caret, {
      x,
      y,
      height: lineHeight,
      autoAlpha: visible ? 1 : 0,
      duration: prefersMotionReduction ? 0 : 0.2,
      ease: prefersMotionReduction ? 'none' : 'elastic.out(1, 0.78)',
      overwrite: true,
    })
  }, [disabled, focused, readOnly, reducedMotion])

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      measureCaret()
    })
  }, [measureCaret])

  useLayoutEffect(() => { scheduleMeasure() })

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setReducedMotion(motionPreference.matches)
    const updateSelection = () => scheduleMeasure()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure)

    updateMotionPreference()
    resizeObserver?.observe(textarea)
    textarea.addEventListener('scroll', updateSelection, { passive: true })
    document.addEventListener('selectionchange', updateSelection)
    window.addEventListener('resize', updateSelection, { passive: true })
    motionPreference.addEventListener('change', updateMotionPreference)

    return () => {
      resizeObserver?.disconnect()
      textarea.removeEventListener('scroll', updateSelection)
      document.removeEventListener('selectionchange', updateSelection)
      window.removeEventListener('resize', updateSelection)
      motionPreference.removeEventListener('change', updateMotionPreference)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      if (caretRef.current) gsap.killTweensOf(caretRef.current)
    }
  }, [scheduleMeasure])

  return (
    <span className="smooth-input-shell" data-caret-active={focused && collapsedSelection && !disabled && !readOnly}>
      <textarea
        {...props}
        ref={setTextareaRef}
        className={className}
        disabled={disabled}
        readOnly={readOnly}
        style={{ ...style, caretColor: focused && collapsedSelection && !disabled && !readOnly ? 'transparent' : style?.caretColor }}
        onChange={(event) => { onChange?.(event); scheduleMeasure() }}
        onSelect={(event) => { onSelect?.(event); scheduleMeasure() }}
        onClick={(event) => { onClick?.(event); scheduleMeasure() }}
        onKeyUp={(event) => { onKeyUp?.(event); scheduleMeasure() }}
        onFocus={(event) => { setFocused(true); onFocus?.(event); scheduleMeasure() }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); scheduleMeasure() }}
        onScroll={(event) => { onScroll?.(event); scheduleMeasure() }}
        onCompositionEnd={(event) => { onCompositionEnd?.(event); scheduleMeasure() }}
      />
      <span className="smooth-input-caret" ref={caretRef} aria-hidden="true" />
    </span>
  )
})

