import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { CrowdCanvas } from '../CrowdCanvas'
import { GreetingIntro, GREETING_WORDS } from '../GreetingIntro'
import { finishGreetingIntro, INTRO_PENDING_KEY, INTRO_PLAYED_KEY } from '../../lib/greetingIntro'

export function AuthenticatedCanvasLayout() {
  const { user } = useAuth()
  const [introVisible, setIntroVisible] = useState(false)

  useEffect(() => {
    if (!user) return
    try {
      if (sessionStorage.getItem(INTRO_PENDING_KEY) !== '1') return
      sessionStorage.removeItem(INTRO_PENDING_KEY)
      if (sessionStorage.getItem(INTRO_PLAYED_KEY) === '1' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        sessionStorage.setItem(INTRO_PLAYED_KEY, '1')
        return
      }
      setIntroVisible(true)
    } catch {
      // A blocked sessionStorage disables the optional intro, not the workspace.
    }
  }, [user])

  function completeIntro() {
    finishGreetingIntro()
    setIntroVisible(false)
  }

  return (
    <>
      <CrowdCanvas />
      <Outlet />
      {introVisible && <GreetingIntro words={GREETING_WORDS} onComplete={completeIntro} />}
    </>
  )
}
