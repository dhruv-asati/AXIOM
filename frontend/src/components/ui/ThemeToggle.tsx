import { Moon, Sun } from 'lucide-react'
import { useTheme, type ThemeTransitionOptions } from '../../context/ThemeContext'
import './ThemeToggle.css'

type ThemeToggleProps = {
  className?: string
  compact?: boolean
  transition?: ThemeTransitionOptions
  ariaDescribedBy?: string
}

export function ThemeToggle({ className = '', compact = false, transition, ariaDescribedBy }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const dark = theme === 'dark'
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  const Icon = dark ? Sun : Moon

  return <button
    className={`axiom-theme-toggle${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
    type="button"
    onClick={(event) => toggleTheme(event.currentTarget, transition)}
    aria-label={label}
    aria-pressed={dark}
    aria-describedby={ariaDescribedBy}
    title={label}
  >
    <span className="axiom-theme-toggle-icon" aria-hidden="true"><Icon size={compact ? 20 : 16} strokeWidth={1.8} /></span>
    {!compact && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
  </button>
}
