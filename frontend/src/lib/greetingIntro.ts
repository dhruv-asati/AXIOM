export const INTRO_PENDING_KEY = 'introPending'
export const INTRO_PLAYED_KEY = 'introPlayed'

export function armGreetingIntro() {
  try {
    sessionStorage.removeItem(INTRO_PLAYED_KEY)
    sessionStorage.setItem(INTRO_PENDING_KEY, '1')
  } catch {
    // The login still succeeds when session storage is unavailable.
  }
}

export function clearGreetingIntro() {
  try {
    sessionStorage.removeItem(INTRO_PENDING_KEY)
    sessionStorage.removeItem(INTRO_PLAYED_KEY)
  } catch {
    // Storage may be disabled by the browser.
  }
}

export function finishGreetingIntro() {
  try {
    sessionStorage.removeItem(INTRO_PENDING_KEY)
    sessionStorage.setItem(INTRO_PLAYED_KEY, '1')
  } catch {
    // The intro can finish even if the browser blocks session storage.
  }
}
