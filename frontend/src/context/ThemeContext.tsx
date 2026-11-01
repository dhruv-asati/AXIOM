import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export type AppTheme = 'light' | 'dark'

type ThemeContextValue = {
  theme: AppTheme
  toggleTheme: (source?: HTMLElement | null, options?: ThemeTransitionOptions) => void
}

export type ThemeTransitionVariant = 'circle' | 'rectangle' | 'gif' | 'polygon' | 'circle-blur'
export type ThemeTransitionOrigin = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'bottom-up' | 'top-down' | 'left-right' | 'right-left'
export type ThemeTransitionOptions = { variant?: ThemeTransitionVariant; origin?: ThemeTransitionOrigin; gifSrc?: string }

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readSavedTheme(): AppTheme {
  try { return localStorage.getItem('axiom-theme') === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>(readSavedTheme)
  const transitionRunning = useRef(false)

  useEffect(() => {
    try { localStorage.setItem('axiom-theme', theme) } catch { /* Keep the selected theme for this session. */ }
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggleTheme = useCallback((source?: HTMLElement | null, options: ThemeTransitionOptions = {}) => {
    const root = document.documentElement
    const nextTheme: AppTheme = root.dataset.theme === 'dark' ? 'light' : 'dark'
    const variant = options.variant ?? 'circle'
    const origin = options.origin ?? 'center'
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const viewTransitionDocument = document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } }
    const run = () => {
      try { localStorage.setItem('axiom-theme', nextTheme) } catch { /* Keep the selected theme for this session. */ }
      root.dataset.theme = nextTheme
      flushSync(() => setTheme(nextTheme))
    }

    if (transitionRunning.current) return
    if (reducedMotion || !viewTransitionDocument.startViewTransition) {
      run()
      return
    }

    const origins: Record<ThemeTransitionOrigin, [number, number]> = {
      center: [.5, .5], 'top-left': [0, 0], 'top-right': [1, 0],
      'bottom-left': [0, 1], 'bottom-right': [1, 1], 'top-center': [.5, 0],
      'bottom-center': [.5, 1], 'bottom-up': [.5, 1], 'top-down': [.5, 0],
      'left-right': [0, .5], 'right-left': [1, .5],
    }
    const rect = options.origin === undefined ? source?.getBoundingClientRect() : undefined
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth * origins[origin][0]
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight * origins[origin][1]
    root.style.setProperty('--theme-transition-origin', `${origins[origin][0] * 100}% ${origins[origin][1] * 100}%`)
    root.style.setProperty('--theme-transition-x', `${x}px`)
    root.style.setProperty('--theme-transition-y', `${y}px`)
    root.dataset.themeAnimation = variant === 'gif' && !options.gifSrc ? 'circle' : variant
    transitionRunning.current = true

    let gifOverlay: HTMLDivElement | null = null
    if (variant === 'gif' && options.gifSrc) {
      gifOverlay = document.createElement('div')
      gifOverlay.className = 'theme-transition-gif-overlay'
      gifOverlay.style.backgroundImage = `url("${options.gifSrc.replace(/["\\]/g, '')}")`
      document.body.append(gifOverlay)
    }
    try {
      const transition = viewTransitionDocument.startViewTransition(run)
      void transition.finished.catch(() => undefined).finally(() => {
        transitionRunning.current = false
        delete root.dataset.themeAnimation
        root.style.removeProperty('--theme-transition-origin')
        root.style.removeProperty('--theme-transition-x')
        root.style.removeProperty('--theme-transition-y')
        gifOverlay?.remove()
      })
    } catch {
      transitionRunning.current = false
      delete root.dataset.themeAnimation
      gifOverlay?.remove()
      run()
    }
  }, [])
  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
