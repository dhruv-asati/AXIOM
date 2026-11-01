import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import './CrowdCanvas.css'

type Walker = {
  sprite: number
  lane: number
  x: number
  baselineRatio: number
  speed: number
  direction: -1 | 1
  heightRatio: number
  phase: number
  bounce: number
}

type CrowdLane = {
  minHeight: number
  maxHeight: number
  minBaseline: number
  maxBaseline: number
}

const SPRITE_COLUMNS = 15
const SPRITE_ROWS = 7
const SPRITE_WIDTH = 3600 / SPRITE_COLUMNS
const SPRITE_HEIGHT = 2268 / SPRITE_ROWS
const MAX_DPR = 1.25
const TARGET_FRAME_MS = 1000 / 30
const CROWD_DENSITY = 1.5
const CROWD_LANES: CrowdLane[] = [
  { minHeight: 0.23, maxHeight: 0.29, minBaseline: 0.69, maxBaseline: 0.75 },
  { minHeight: 0.32, maxHeight: 0.4, minBaseline: 0.82, maxBaseline: 0.89 },
  { minHeight: 0.43, maxHeight: 0.55, minBaseline: 0.98, maxBaseline: 1.04 },
]

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function laneDensity(width: number, height: number, lane: number) {
  const spec = CROWD_LANES[lane]
  const averageHeight = height * (spec.minHeight + spec.maxHeight) / 2
  const stride = averageHeight * (SPRITE_WIDTH / SPRITE_HEIGHT) * 0.58
  return Math.max(3, Math.ceil(width / stride * CROWD_DENSITY) + 2)
}

function createWalker(width: number, height: number, lane: number, x?: number): Walker {
  const spec = CROWD_LANES[lane]
  const direction: -1 | 1 = Math.random() < 0.5 ? 1 : -1
  const heightRatio = randomBetween(spec.minHeight, spec.maxHeight)
  const margin = height * heightRatio * (SPRITE_WIDTH / SPRITE_HEIGHT)
  return {
    sprite: Math.floor(Math.random() * SPRITE_COLUMNS * SPRITE_ROWS),
    lane,
    x: x ?? randomBetween(-margin, width + margin),
    baselineRatio: randomBetween(spec.minBaseline, spec.maxBaseline),
    speed: width * randomBetween(0.0234, 0.0585),
    direction,
    heightRatio,
    phase: randomBetween(0, Math.PI * 2),
    bounce: randomBetween(1, 2.5),
  }
}

function createCrowd(width: number, height: number) {
  return CROWD_LANES.flatMap((lane, laneIndex) => {
    const count = laneDensity(width, height, laneIndex)
    const averageCharacterWidth = height * ((lane.minHeight + lane.maxHeight) / 2) * (SPRITE_WIDTH / SPRITE_HEIGHT)
    const margin = averageCharacterWidth * 0.75
    return Array.from({ length: count }, (_, index) => {
      const position = index / Math.max(1, count - 1)
      const x = -margin + position * (width + margin * 2)
        + randomBetween(-averageCharacterWidth * 0.08, averageCharacterWidth * 0.08)
      return createWalker(width, height, laneIndex, x)
    })
  }).sort((a, b) => a.baselineRatio - b.baselineRatio)
}

export function CrowdCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const context = canvas.getContext('2d', { alpha: true })
    if (!context) {
      container.classList.add('crowd-canvas-fallback')
      return
    }

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    let walkers: Walker[] = createCrowd(width, height)
    let elapsedSinceRender = 0
    let disposed = false
    let tickerAttached = false
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionPreference.matches
    const image = new Image()
    image.src = '/images/peeps/all-peeps.png'

    const render = (_time: number, deltaMs: number, frameOrForce: number | boolean = false) => {
      if (disposed || !image.complete || !image.naturalWidth || document.hidden) return

      const force = frameOrForce === true
      elapsedSinceRender += deltaMs
      if (!force && !reducedMotion && elapsedSinceRender < TARGET_FRAME_MS) return
      const delta = reducedMotion ? 0 : Math.min(elapsedSinceRender / 1000, 0.05)
      elapsedSinceRender = 0
      const now = performance.now() / 1000
      context.clearRect(0, 0, width, height)
      context.globalAlpha = 0.9

      for (const walker of walkers) {
        if (!reducedMotion) walker.x += walker.speed * walker.direction * delta
        const characterHeight = height * walker.heightRatio
        const spriteWidth = characterHeight * (SPRITE_WIDTH / SPRITE_HEIGHT)
        const bob = reducedMotion ? 0 : Math.sin(now * 7 + walker.phase) * walker.bounce
        const left = walker.x - spriteWidth / 2
        const top = height * walker.baselineRatio - characterHeight + bob
        const sourceX = (walker.sprite % SPRITE_COLUMNS) * SPRITE_WIDTH
        const sourceY = Math.floor(walker.sprite / SPRITE_COLUMNS) * SPRITE_HEIGHT

        context.save()
        if (walker.direction < 0) {
          context.translate(walker.x * 2, 0)
          context.scale(-1, 1)
        }
        context.drawImage(image, sourceX, sourceY, SPRITE_WIDTH, SPRITE_HEIGHT, left, top, spriteWidth, characterHeight)
        context.restore()

        if (!reducedMotion && (walker.direction > 0 ? left > width + spriteWidth : left + spriteWidth < -spriteWidth)) {
          const margin = spriteWidth * 0.7
          walker.x = walker.direction > 0 ? -margin : width + margin
          walker.sprite = Math.floor(Math.random() * SPRITE_COLUMNS * SPRITE_ROWS)
          walker.phase = randomBetween(0, Math.PI * 2)
        }
      }
      context.globalAlpha = 1
    }

    const resize = () => {
      const previousWidth = width
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (previousWidth > 0 && walkers.length) {
        const scale = width / previousWidth
        walkers.forEach((walker) => {
          walker.x *= scale
          walker.speed *= scale
        })
      }
      for (let lane = 0; lane < CROWD_LANES.length; lane += 1) {
        const laneWalkers = walkers.filter((walker) => walker.lane === lane)
        const target = laneDensity(width, height, lane)
        if (laneWalkers.length > target) {
          for (const walker of laneWalkers.slice(target)) walkers.splice(walkers.indexOf(walker), 1)
        } else if (laneWalkers.length < target) {
          const missing = target - laneWalkers.length
          walkers.push(...Array.from({ length: missing }, () => createWalker(width, height, lane)))
        }
      }
      walkers.sort((a, b) => a.baselineRatio - b.baselineRatio)
      render(0, TARGET_FRAME_MS, true)
    }

    const onVisibilityChange = () => {
      if (!document.hidden) render(0, TARGET_FRAME_MS, true)
    }
    const onMotionPreferenceChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches
      if (reducedMotion) {
        if (tickerAttached) gsap.ticker.remove(render)
        tickerAttached = false
        render(0, TARGET_FRAME_MS, true)
      } else if (!tickerAttached) {
        gsap.ticker.add(render)
        tickerAttached = true
      }
    }
    const onImageLoad = () => render(0, TARGET_FRAME_MS, true)
    const onImageError = () => container.classList.add('crowd-canvas-fallback')

    resize()
    image.addEventListener('load', onImageLoad)
    image.addEventListener('error', onImageError)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('resize', resize, { passive: true })
    motionPreference.addEventListener('change', onMotionPreferenceChange)
    if (!reducedMotion) {
      gsap.ticker.add(render)
      tickerAttached = true
    }
    if (image.complete && image.naturalWidth) render(0, TARGET_FRAME_MS, true)

    return () => {
      disposed = true
      if (tickerAttached) gsap.ticker.remove(render)
      gsap.killTweensOf(walkers)
      image.removeEventListener('load', onImageLoad)
      image.removeEventListener('error', onImageError)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('resize', resize)
      motionPreference.removeEventListener('change', onMotionPreferenceChange)
      context.clearRect(0, 0, width, height)
    }
  }, [])

  return (
    <div className="crowd-canvas-layer" ref={containerRef} aria-hidden="true">
      <canvas className="crowd-canvas" ref={canvasRef} />
    </div>
  )
}
