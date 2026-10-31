import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { CustomEase } from 'gsap/CustomEase'
import './GreetingIntro.css'

gsap.registerPlugin(CustomEase)
const CURTAIN_EASE = CustomEase.create('axiomCurtain', '0.76,0,0.24,1')
const INTRO_BLUE = '#1f3e78'

export const GREETING_WORDS = ['Hello', 'Bonjour', 'Ciao', 'ಹಲೋ', 'Hallå', 'Guten Tag', 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਜੀ']

type GreetingIntroProps = {
  words: string[]
  onComplete: () => void
}

const TILE_SIZE = 30
const FIRST_WORD_HOLD = 0.92
const MIDDLE_WORD_HOLD = 0.19
const LAST_WORD_HOLD = 1.02
const EXIT_DURATION = 0.88

export function GreetingIntro({ words, onComplete }: GreetingIntroProps) {
  const curtainRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const wordRef = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)
  const [activeWord, setActiveWord] = useState('')
  const [grid] = useState(() => {
    const columns = Math.ceil(window.innerWidth / TILE_SIZE)
    const rows = Math.ceil(window.innerHeight / TILE_SIZE)
    return { columns, rows, tiles: Array.from({ length: columns * rows }, (_, index) => index) }
  })

  onCompleteRef.current = onComplete

  useEffect(() => {
    const curtain = curtainRef.current
    const overlay = overlayRef.current
    const tileGrid = gridRef.current
    const word = wordRef.current
    if (!curtain || !overlay || !tileGrid || !word) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const tiles = tileGrid.querySelectorAll<HTMLElement>('.greeting-intro-tile')
    const timeline = gsap.timeline({ onComplete: () => onCompleteRef.current() })
    gsap.set(word, { autoAlpha: 0, y: 0 })
    timeline.to(tiles, {
      backgroundColor: INTRO_BLUE,
      rotateY: 88,
      duration: 0.16,
      ease: 'power2.inOut',
      stagger: (index) => {
        const column = index % grid.columns
        const sweep = column / Math.max(1, grid.columns - 1)
        return sweep * 0.46 + Math.random() * 0.1
      },
    })
    timeline.call(() => setActiveWord(words[0] ?? 'Hello'))
    timeline.to(word, { autoAlpha: 1, color: '#fff', duration: 0.24, ease: 'power2.out' })
    timeline.to({}, { duration: FIRST_WORD_HOLD })

    words.slice(1, -1).forEach((greeting) => {
      timeline.call(() => setActiveWord(greeting))
      timeline.to({}, { duration: MIDDLE_WORD_HOLD })
    })

    timeline.call(() => setActiveWord(words.at(-1) ?? 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਜੀ'))
    timeline.to({}, { duration: LAST_WORD_HOLD })
    timeline.set(tileGrid, { autoAlpha: 0 })
    timeline.to(word, { y: -25, duration: EXIT_DURATION, ease: CURTAIN_EASE })
    timeline.to(curtain, { yPercent: -116, duration: EXIT_DURATION, ease: CURTAIN_EASE }, '<')
    timeline.to(overlay, { backgroundColor: 'rgba(31,62,120,0)', duration: 0.18 }, '<')

    return () => {
      timeline.kill()
      gsap.killTweensOf([overlay, curtain, tileGrid, word, ...Array.from(tiles)])
      document.body.style.overflow = previousOverflow
    }
  }, [grid.columns, grid.tiles, words])

  const language = activeWord === 'ಹಲೋ' ? 'kn' : activeWord.startsWith('ਸਤਿ') ? 'pa' : 'en'

  return (
    <div className="greeting-intro-overlay" ref={overlayRef} aria-hidden="true">
      <div className="greeting-intro-curtain" ref={curtainRef}>
        <svg className="greeting-intro-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0H100V87 Q50 105 0 87Z" />
        </svg>
        <div
          className="greeting-intro-grid"
          ref={gridRef}
          style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` }}
        >
          {grid.tiles.map((index) => <span className="greeting-intro-tile" key={index} />)}
        </div>
        <div className="greeting-intro-word" ref={wordRef} lang={language}>{activeWord}</div>
      </div>
    </div>
  )
}
