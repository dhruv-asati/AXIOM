import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { gsap } from 'gsap'
import type { TeamMember } from './teamMembers'
import './HoverMember.css'

type HoverMemberProps = {
  teamMembers: TeamMember[]
  brandText?: string
  groupLabel?: string
  showDescription?: boolean
  animateText?: boolean
}

type LetterTransition = { from: string; to: string }

function letters(value: string, className: string) {
  return Array.from(value).map((letter, index) => (
    <span className="hover-member-letter-clip" key={`${className}-${index}`}>
      <span className={className} data-letter-index={index}>{letter === ' ' ? '\u00a0' : letter}</span>
    </span>
  ))
}

export function HoverMember({ teamMembers, brandText = 'AXIOM', groupLabel = 'AXIOM team members', showDescription = false, animateText = true }: HoverMemberProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLSpanElement>(null)
  const wordRef = useRef<HTMLDivElement>(null)
  const currentTextRef = useRef(brandText.toUpperCase())
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [transition, setTransition] = useState<LetterTransition>({
    from: brandText.toUpperCase(),
    to: brandText.toUpperCase(),
  })

  const activeText = activeIndex === null ? brandText.toUpperCase() : teamMembers[activeIndex]?.name.toUpperCase() ?? brandText.toUpperCase()
  const activeDescription = activeIndex === null ? '' : teamMembers[activeIndex]?.description ?? ''
  const isIdle = transition.from === transition.to

  function positionCursor(cursor: HTMLSpanElement, x: number, y: number) {
    const position = { x, y }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(cursor, position)
      return
    }
    gsap.to(cursor, { ...position, duration: 0.32, ease: 'elastic.out(1, 0.62)', overwrite: 'auto' })
  }

  useEffect(() => {
    const next = activeText
    const from = currentTextRef.current
    if (next === from) return
    currentTextRef.current = next
    if (!animateText) {
      setTransition({ from: next, to: next })
      return
    }
    setTransition({ from, to: next })
  }, [activeText, animateText])

  useEffect(() => {
    const word = wordRef.current
    if (!word || !animateText || transition.from === transition.to) return
    const previous = word.querySelectorAll<HTMLElement>('.hover-member-old .hover-member-letter')
    const incoming = word.querySelectorAll<HTMLElement>('.hover-member-new .hover-member-letter')
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timeline = gsap.timeline({ onComplete: () => setTransition({ from: transition.to, to: transition.to }) })

    if (reduceMotion) {
      gsap.set(previous, { yPercent: 0, autoAlpha: 0 })
      gsap.set(incoming, { yPercent: 0, autoAlpha: 0 })
      gsap.to(incoming, {
        autoAlpha: 1,
        duration: 0.18,
        stagger: 0.012,
        onComplete: () => setTransition({ from: transition.to, to: transition.to }),
      })
      return () => {
        timeline.kill()
        gsap.killTweensOf([previous, incoming])
      }
    }

    gsap.set(previous, { yPercent: 0, skewY: 0, autoAlpha: 1 })
    gsap.set(incoming, { yPercent: 120, skewY: 4, autoAlpha: 1 })
    timeline.to(previous, {
      yPercent: 120,
      skewY: -4,
      duration: 0.28,
      ease: 'power3.in',
      stagger: 0.026,
    }, 0)
    timeline.to(incoming, {
      yPercent: 0,
      skewY: 0,
      duration: 0.42,
      ease: 'expo.out',
      stagger: 0.026,
    }, 0.035)
    return () => { timeline.kill() }
  }, [animateText, transition])

  useEffect(() => () => {
    if (cursorRef.current) gsap.killTweensOf(cursorRef.current)
  }, [])

  function moveCursor(event: PointerEvent<HTMLButtonElement>) {
    const cursor = cursorRef.current
    const root = rootRef.current
    if (!cursor || !root) return
    const bounds = root.getBoundingClientRect()
    positionCursor(cursor, event.clientX - bounds.left + 12, event.clientY - bounds.top - 34)
  }

  function selectOnTouch(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (event.pointerType !== 'touch' && !window.matchMedia('(hover: none)').matches) return
    setActiveIndex((current) => current === index ? null : index)
    const root = rootRef.current
    const cursor = cursorRef.current
    if (!root || !cursor) return
    const rootRect = root.getBoundingClientRect()
    const buttonRect = event.currentTarget.getBoundingClientRect()
    positionCursor(cursor, buttonRect.left - rootRect.left + buttonRect.width * 0.78, buttonRect.top - rootRect.top - 8)
  }

  return (
    <div
      className="hover-member"
      ref={rootRef}
      data-active={activeIndex !== null}
      data-card-position={activeIndex === null ? undefined : activeIndex === 1 ? 'validation-top' : activeIndex % 2 === 0 ? 'top-left' : 'top-right'}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setActiveIndex(null)
      }}
    >
      <div className="hover-member-avatar-row" role="group" aria-label={groupLabel}>
        {teamMembers.map((member, index) => (
          <button
            className={`hover-member-avatar${activeIndex === index ? ' is-active' : ''}`}
            type="button"
            key={`${member.name}-${member.image}`}
            aria-label={member.name}
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') { setActiveIndex(index); moveCursor(event) } }}
            onPointerMove={(event) => { if (event.pointerType === 'mouse') moveCursor(event) }}
            onPointerDown={(event) => selectOnTouch(event, index)}
            onFocus={() => setActiveIndex(index)}
            onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setActiveIndex(null) }}
          >
            <img src={member.image} alt={member.name} loading="lazy" />
          </button>
        ))}
      </div>

      <span className="hover-member-cursor" ref={cursorRef} aria-hidden="true"><ArrowUpRight size={23} strokeWidth={2.5} /></span>

      <div className={`hover-member-word${activeIndex === null ? '' : ' is-highlighted'}`} ref={wordRef} role="img" aria-label={activeText}>
        <span className={`hover-member-word-layer hover-member-old${isIdle && activeIndex !== null ? ' is-idle-hidden' : ''}`} aria-hidden="true">{letters(transition.from, 'hover-member-letter')}</span>
        <span className={`hover-member-word-layer hover-member-new${isIdle && activeIndex === null ? ' is-idle-hidden' : ''}`} aria-hidden="true">{letters(transition.to, 'hover-member-letter')}</span>
      </div>
      {showDescription && activeDescription && (
        <p
          className="hover-member-description"
          aria-live="polite"
        >
          {activeDescription}
        </p>
      )}
    </div>
  )
}
