import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { buildAllowedTimes, nearestAllowedTime, toMinutes as parseTime, toTimeString as timeString, type TimeOption } from '../lib/wheelTime'
import './WheelTimePicker.css'

export type WheelTimeSlot = TimeOption
export type WheelTimePickerProps = {
  value?: string | Date
  defaultValue?: string | Date
  onChange?: (value: string) => void
  minuteStep?: 1 | 5 | 15 | 30
  minTime?: string
  maxTime?: string
  disabledSlots?: string[]
  slots?: WheelTimeSlot[]
  use12Hour?: boolean
  className?: string
  label?: string
  placeholder?: string
  variant?: 'inline' | 'popover'
  disabled?: boolean
}

const ROW_HEIGHT = 36
const WHEEL_PADDING = ROW_HEIGHT * 3
const displayTime = (minutes: number, use12Hour: boolean) => {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return use12Hour
    ? `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
    : `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

type WheelOption = { label: string; value: number; disabled?: boolean }
type WheelColumnProps = {
  label: string
  options: WheelOption[]
  selectedIndex: number
  valueText: string
  disabled?: boolean
  onSettle: (index: number) => void
}

function WheelColumn({ label, options, selectedIndex, valueText, disabled, onSettle }: WheelColumnProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programmaticResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const programmaticRef = useRef(false)
  const [visualIndex, setVisualIndex] = useState(selectedIndex)
  const paddedOptions = useMemo(() => options, [options])

  useEffect(() => {
    setVisualIndex(selectedIndex)
    const node = scrollerRef.current
    if (node && Math.abs(node.scrollTop - selectedIndex * ROW_HEIGHT) > 2) {
      programmaticRef.current = true
      node.scrollTop = selectedIndex * ROW_HEIGHT
      const reset = setTimeout(() => { programmaticRef.current = false }, 100)
      return () => clearTimeout(reset)
    }
  }, [selectedIndex])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (programmaticResetRef.current) clearTimeout(programmaticResetRef.current)
  }, [])

  const resetProgrammaticScroll = (delay: number) => {
    if (programmaticResetRef.current) clearTimeout(programmaticResetRef.current)
    programmaticResetRef.current = setTimeout(() => { programmaticRef.current = false }, delay)
  }

  const settle = () => {
    const node = scrollerRef.current
    if (!node) return
    const next = Math.min(options.length - 1, Math.max(0, Math.round(node.scrollTop / ROW_HEIGHT)))
    setVisualIndex(next)
    programmaticRef.current = true
    node.scrollTo({ top: next * ROW_HEIGHT, behavior: 'smooth' })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSettle(next), 190)
    resetProgrammaticScroll(250)
  }

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(options.length - 1, index))
    if (options[next]?.disabled) return
    setVisualIndex(next)
    programmaticRef.current = true
    scrollerRef.current?.scrollTo({ top: next * ROW_HEIGHT, behavior: 'smooth' })
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSettle(next), 210)
    resetProgrammaticScroll(270)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    let target = visualIndex
    const key = event.key
    if (key === 'ArrowDown') target += 1
    else if (key === 'ArrowUp') target -= 1
    else if (key === 'PageDown') target += 5
    else if (key === 'PageUp') target -= 5
    else if (key === 'Home') target = options.findIndex((option) => !option.disabled)
    else if (key === 'End') target = options.findLastIndex((option) => !option.disabled)
    else return
    event.preventDefault()
    const direction = target >= visualIndex ? 1 : -1
    target = Math.max(0, Math.min(options.length - 1, target))
    while (options[target]?.disabled && target + direction >= 0 && target + direction < options.length) target += direction
    if (!options[target]?.disabled) moveTo(target)
  }

  return <div className="wheel-time-column-wrap">
    <div className="wheel-time-column-label" aria-hidden="true">{label}</div>
    <div className="wheel-time-tick wheel-time-tick-left" aria-hidden="true">−</div>
    <div
      className="wheel-time-column"
      ref={scrollerRef}
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuetext={valueText}
      aria-valuemin={options[0]?.value}
      aria-valuemax={options.at(-1)?.value}
      aria-valuenow={options[visualIndex]?.value}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
      onScroll={() => {
        if (programmaticRef.current) return
        const node = scrollerRef.current
        if (!node) return
        setVisualIndex(Math.min(options.length - 1, Math.max(0, Math.round(node.scrollTop / ROW_HEIGHT))))
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(settle, 145)
      }}
      onWheel={(event) => {
        if (disabled) return
        event.preventDefault()
        moveTo(visualIndex + (event.deltaY >= 0 ? 1 : -1))
      }}
    >
      <div className="wheel-time-options" style={{ paddingBlock: WHEEL_PADDING }}>
        {paddedOptions.map((option, index) => {
          const optionIndex = index
          const distance = optionIndex - visualIndex
          const isSelected = optionIndex === visualIndex
          const dimmed = option.disabled
          return <button
            className={`wheel-time-option${isSelected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
            type="button"
            key={`${label}-${index}`}
            tabIndex={-1}
            disabled={option.disabled || disabled}
            style={{ '--wheel-distance': Math.min(3, Math.abs(distance)) } as CSSProperties}
            onClick={() => moveTo(optionIndex)}
          >{option.label}</button>
        })}
      </div>
    </div>
    <div className="wheel-time-tick wheel-time-tick-right" aria-hidden="true">−</div>
  </div>
}

export function WheelTimePicker({
  value,
  defaultValue,
  onChange,
  minuteStep = 1,
  minTime,
  maxTime,
  disabledSlots = [],
  slots,
  use12Hour = true,
  className = '',
  label = 'Choose time',
  placeholder = 'Select time',
  variant = 'inline',
  disabled = false,
}: WheelTimePickerProps) {
  const controlled = value !== undefined
  const [selectedMinutes, setSelectedMinutes] = useState(() => parseTime(value ?? defaultValue))
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})
  const available = useMemo(() => buildAllowedTimes({ minuteStep, minTime, maxTime, disabledSlots, slots }), [disabledSlots, maxTime, minTime, minuteStep, slots])
  const chosen = nearestAllowedTime(selectedMinutes, available)

  useEffect(() => {
    if (controlled) setSelectedMinutes(parseTime(value))
  }, [controlled, value])

  useEffect(() => {
    if (available.length && !available.includes(selectedMinutes)) setSelectedMinutes(chosen)
  }, [available, chosen, selectedMinutes])

  useEffect(() => {
    if (!open || variant !== 'popover') return
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const popoverHeight = 365
      const below = window.innerHeight - rect.bottom
      const top = below >= popoverHeight + 8
        ? rect.bottom + 8
        : Math.max(8, rect.top - popoverHeight - 8)
      setPopoverStyle({ position: 'fixed', top, left: Math.max(8, Math.min(rect.left, window.innerWidth - 344)), zIndex: 120 })
    }
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.wheel-time-popover') && !triggerRef.current?.contains(target)) setOpen(false)
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', dismiss)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', dismiss)
    }
  }, [open, variant])

  const isValid = (minutes: number) => available.includes(minutes)
  const nearest = (minutes: number) => nearestAllowedTime(minutes, available)
  const emit = (minutes: number) => {
    const next = nearest(minutes)
    setSelectedMinutes(next)
    if (!controlled || value == null || value === '' || next !== parseTime(value)) onChange?.(timeString(next))
  }
  const hour24 = Math.floor(chosen / 60)
  const minute = chosen % 60
  const period = hour24 < 12 ? 0 : 1
  const hour12 = hour24 % 12 || 12
  const hours = use12Hour ? Array.from({ length: 12 }, (_, index) => index + 1) : Array.from({ length: 24 }, (_, index) => index)
  const currentHour = use12Hour ? hour12 : hour24
  const hourOptions: WheelOption[] = hours.map((hour) => {
    const candidateHour = use12Hour ? (hour % 12) + period * 12 : hour
    return { label: String(hour), value: hour, disabled: !available.some((time) => Math.floor(time / 60) === candidateHour) }
  })
  const hourIndex = Math.max(0, hours.indexOf(currentHour))
  const minuteOptions: WheelOption[] = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep)
    .filter((m) => m < 60)
    .map((m) => ({ label: String(m).padStart(2, '0'), value: m, disabled: !isValid(hour24 * 60 + m) }))
  let minuteIndex = minuteOptions.findIndex((option) => option.value === minute)
  if (minuteIndex < 0) minuteIndex = 0
  const periodOptions: WheelOption[] = [
    { label: 'AM', value: 0, disabled: !available.some((time) => Math.floor(time / 60) % 12 === hour12 % 12 && time < 720) },
    { label: 'PM', value: 1, disabled: !available.some((time) => Math.floor(time / 60) % 12 === hour12 % 12 && time >= 720) },
  ]
  const commitHour = (index: number) => {
    const selectedHour = hours[index]
    const hour = use12Hour ? (selectedHour % 12) + period * 12 : selectedHour
    emit(hour * 60 + minute)
  }
  const commitMinute = (index: number) => emit(hour24 * 60 + minuteOptions[index].value)
  const commitPeriod = (index: number) => emit((hour12 % 12 + index * 12) * 60 + minute)
  const hasExplicitValue = controlled ? value !== undefined && value !== '' : defaultValue !== undefined && defaultValue !== ''
  const shownTime = hasExplicitValue ? displayTime(chosen, use12Hour) : placeholder

  const card = <div className={`wheel-time-card${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
    <div className="wheel-time-selection" aria-hidden="true" />
    <div className="wheel-time-columns">
      <WheelColumn label="HOURS" options={hourOptions} selectedIndex={hourIndex} valueText={`${currentHour} hours`} disabled={disabled || available.length === 0} onSettle={commitHour} />
      <WheelColumn label="MINUTES" options={minuteOptions} selectedIndex={minuteIndex} valueText={`${minute} minutes`} disabled={disabled || available.length === 0} onSettle={commitMinute} />
      {use12Hour && <WheelColumn label="AM/PM" options={periodOptions} selectedIndex={period} valueText={period ? 'PM' : 'AM'} disabled={disabled || available.length === 0} onSettle={commitPeriod} />}
    </div>
  </div>

  if (variant === 'inline') return <div className="wheel-time-picker-inline">{card}</div>
  return <div className="wheel-time-picker-popover-anchor">
    <button ref={triggerRef} className="wheel-time-trigger" type="button" disabled={disabled} aria-label={`${label}: ${shownTime}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{shownTime}</button>
    {open && createPortal(<div className="wheel-time-popover" role="dialog" aria-label={label} style={popoverStyle}>
      {card}
      <button type="button" className="wheel-time-done" onClick={() => setOpen(false)}>Done</button>
    </div>, document.body)}
  </div>
}

export function formatWheelTime(value?: string | Date, use12Hour = true) {
  return displayTime(parseTime(value), use12Hour)
}

export function normalizeWheelTime(value: string) {
  return timeString(parseTime(value))
}
