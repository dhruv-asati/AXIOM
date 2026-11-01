import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type Ref } from 'react'
import { gsap } from 'gsap'
import './SmoothInput.css'

type SmoothInputProps = InputHTMLAttributes<HTMLInputElement>

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/** Text input with a spring-following caret. Native input behavior remains intact. */
export const SmoothInput = forwardRef<HTMLInputElement, SmoothInputProps>(function SmoothInput({
  type = 'text',
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
  const inputRef = useRef<HTMLInputElement | null>(null)
  const caretRef = useRef<HTMLSpanElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const [focused, setFocused] = useState(false)
  const [collapsedSelection, setCollapsedSelection] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(false)

  const setInputRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node
    assignRef(forwardedRef, node)
  }, [forwardedRef])

  const measureCaret = useCallback(() => {
    const input = inputRef.current
    const caret = caretRef.current
    if (!input || !caret) return

    const selectionStart = input.selectionStart ?? input.value.length
    const selectionEnd = input.selectionEnd ?? selectionStart
    const isCollapsed = selectionStart === selectionEnd
    setCollapsedSelection(isCollapsed)

    if (!focused || !isCollapsed || disabled || readOnly || document.activeElement !== input) {
      gsap.to(caret, { autoAlpha: 0, duration: reducedMotion ? 0 : 0.08, overwrite: true })
      return
    }

    const computed = window.getComputedStyle(input)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return

    context.font = computed.font
    const beforeCaret = input.value.slice(0, selectionStart)
    const measuredText = type === 'password' ? '•'.repeat(beforeCaret.length) : beforeCaret
    const letterSpacing = Number.parseFloat(computed.letterSpacing) || 0
    const textWidth = context.measureText(measuredText).width + Math.max(0, measuredText.length - 1) * letterSpacing
    const borderLeft = Number.parseFloat(computed.borderLeftWidth) || 0
    const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0
    const x = input.offsetLeft + borderLeft + paddingLeft + textWidth - input.scrollLeft
    const fontSize = Number.parseFloat(computed.fontSize) || 16
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0
    // Single-line inputs center their text in the control even when line-height is `normal`.
    // Center the animated caret from the actual input box instead of guessing its line box.
    const contentHeight = input.clientHeight - borderTop - borderBottom
    const y = input.offsetTop + borderTop + Math.max(0, (contentHeight - fontSize) / 2)
    const visible = x >= borderLeft && x <= input.clientWidth - (Number.parseFloat(computed.paddingRight) || 0)
    const prefersMotionReduction = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    gsap.to(caret, {
      x,
      y,
      height: fontSize,
      autoAlpha: visible ? 1 : 0,
      duration: prefersMotionReduction ? 0 : 0.2,
      ease: prefersMotionReduction ? 'none' : 'elastic.out(1, 0.78)',
      overwrite: true,
    })
  }, [disabled, focused, readOnly, reducedMotion, type])

  const scheduleMeasure = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      measureCaret()
    })
  }, [measureCaret])

  useLayoutEffect(() => {
    scheduleMeasure()
  })

  useEffect(() => {
    const input = inputRef.current
    if (!input) return

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotionPreference = () => setReducedMotion(motionPreference.matches)
    const updateSelection = () => scheduleMeasure()
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure)

    updateMotionPreference()
    resizeObserver?.observe(input)
    input.addEventListener('scroll', updateSelection, { passive: true })
    document.addEventListener('selectionchange', updateSelection)
    window.addEventListener('resize', updateSelection, { passive: true })
    motionPreference.addEventListener('change', updateMotionPreference)

    return () => {
      resizeObserver?.disconnect()
      input.removeEventListener('scroll', updateSelection)
      document.removeEventListener('selectionchange', updateSelection)
      window.removeEventListener('resize', updateSelection)
      motionPreference.removeEventListener('change', updateMotionPreference)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      if (caretRef.current) gsap.killTweensOf(caretRef.current)
    }
  }, [scheduleMeasure])

  return (
    <span className="smooth-input-shell" data-caret-active={focused && collapsedSelection && !disabled && !readOnly}>
      <input
        {...props}
        ref={setInputRef}
        type={type}
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

