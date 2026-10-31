import { useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { homeForRole, useAuth } from '../auth/AuthContext'
import './PublicPages.css'
import { HoverMember } from '../components/HoverMember'
import { SmoothInput } from '../components/ui/SmoothInput'
import { AnimatedLink } from '../components/ui/AnimatedLink'
import { PLACEHOLDER_TEAM_MEMBERS } from '../components/teamMembers'
import { armGreetingIntro } from '../lib/greetingIntro'

export function LoginPage() {
  const { user, loading: authLoading, signIn } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  if (!authLoading && user) return <Navigate to={homeForRole(user.role)} replace />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true); setError('')
    try {
      const signedInUser = await signIn(username, password)
      armGreetingIntro()
      const destination = (location.state as { from?: string } | null)?.from
      navigate(destination || homeForRole(signedInUser.role), { replace: true })
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401 ? 'The username or password is incorrect.' : cause instanceof Error ? cause.message : 'Sign in failed. Please try again.')
    } finally { setSubmitting(false) }
  }

  return <main className="login-page"><section className="login-aside"><Link className="public-brand light" to="/"><span className="public-brand-mark">A</span><span>AXIOM<span className="brand-period">.</span></span></Link><div className="login-aside-copy"><span className="public-eyebrow">CAMPUS OPERATIONS, CONNECTED</span><h1>Everything in<br /><em>its right place.</em></h1><p>Sign in to your campus workspace to review schedules, spaces and the decisions that connect them.</p><div className="login-aside-rule"><LockKeyhole size={17} /><span>Secure, role-aware access</span></div></div><div className="login-team"><HoverMember teamMembers={PLACEHOLDER_TEAM_MEMBERS} /></div><small>Intelligent campus scheduling & venue management</small></section>
    <section className="login-panel"><AnimatedLink className="login-back" variant="center" to="/"><ArrowLeft size={15} /> Back to AXIOM</AnimatedLink><div className="login-form-wrap"><div className="login-form-heading"><span className="public-eyebrow">WELCOME BACK</span><h2>Sign in to AXIOM</h2><p>Use the account provided for your campus role.</p></div>
      {error && <div className="login-error" role="alert">{error}</div>}
      <form onSubmit={submit} className="login-form"><label htmlFor="username">Email or username</label><SmoothInput autoComplete="username" id="username" name="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={120} autoFocus />
        <div className="password-label"><label htmlFor="password">Password</label></div><div className="password-input"><SmoothInput autoComplete="current-password" id="password" name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={1024} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
        <button className="button-primary login-submit" type="submit" disabled={submitting || authLoading}>{submitting ? <><span className="login-spinner" /> Signing in…</> : <>Sign in <ArrowRight size={17} /></>}</button>
      </form><p className="login-security-note"><LockKeyhole size={14} /> Your role is determined by your assigned AXIOM account.</p></div><small className="login-copyright">AXIOM · Campus operations workspace</small></section>
  </main>
}
