import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, ClipboardCheck, Clock3, GraduationCap, Landmark, LockKeyhole, MapPin, ShieldCheck, Sparkles, UsersRound, Waypoints } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { homeForRole, useAuth } from '../auth/AuthContext'
import './PublicPages.css'

const featureItems = [
  { icon: CalendarDays, title: 'Intelligent timetable generation', text: 'Generate a complete weekly schedule with OR-Tools CP-SAT, using campus constraints as solver inputs.', state: 'Implemented' },
  { icon: ShieldCheck, title: 'Conflict detection and validation', text: 'Check room, faculty and group clashes, then export a schedule for the official validator.', state: 'Implemented' },
  { icon: MapPin, title: 'Smart venue booking', text: 'Apply deterministic priority, capacity, accessibility, availability and timetable rules to booking requests.', state: 'Implemented' },
  { icon: GraduationCap, title: 'Exam scheduling', text: 'Include exam sessions and room allocations in generated schedule plans.', state: 'Implemented' },
  { icon: Waypoints, title: 'Disruption-aware rescheduling', text: 'Create a repair proposal against a baseline schedule and route it for review before approval.', state: 'Implemented' },
  { icon: Sparkles, title: 'Natural-language assistant', text: 'Parse schedule and booking requests into structured proposals. Decisions remain rule based and reviewable.', state: 'Request parsing' },
  { icon: ClipboardCheck, title: 'Decision explanations', text: 'Keep booking outcomes and repair proposals with reasons so reviewers can see what shaped a result.', state: 'Implemented' },
  { icon: LockKeyhole, title: 'Role-based access', text: 'Separate campus-wide administration from department, faculty and club workflows.', state: 'Implemented' },
]

const roles = [
  { icon: Landmark, name: "Dean's Office Admin", detail: 'Generate schedules, review changes, configure priority and reset demo activity.', role: 'admin' },
  { icon: UsersRound, name: 'Department Coordinator', detail: 'View the department timetable, request changes and submit department venue bookings.', role: 'department_coordinator' },
  { icon: GraduationCap, name: 'Faculty', detail: 'See your own timetable, submit availability and request schedule changes.', role: 'faculty' },
  { icon: MapPin, name: 'Club Representative', detail: 'Request venues, track decisions and cancel your own eligible requests.', role: 'club_representative' },
]

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuth()
  const workspacePath = user ? homeForRole(user.role) : '/login'
  return <div className="public-site">
    <header className="public-nav">
      <Link className="public-brand" to="/" aria-label="AXIOM home"><span className="public-brand-mark">A</span><span>AXIOM<span className="brand-period">.</span></span></Link>
      <button className="public-menu-toggle" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
      <nav className={menuOpen ? 'public-nav-links is-open' : 'public-nav-links'} aria-label="Public navigation">
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a><a href="#roles" onClick={() => setMenuOpen(false)}>Role access</a>
        <Link className="public-sign-in" to={workspacePath}>{user ? 'Workspace' : 'Sign in'} <ArrowUpRight size={15} /></Link>
      </nav>
    </header>

    <main>
      <section className="public-hero">
        <div className="hero-copy">
          <div className="hero-overline"><span /> CAMPUS OPERATIONS, CONNECTED</div>
          <h1>One campus.<br /><em>Every schedule</em><br />in sync.</h1>
          <p>Timetables, venue bookings, exams and disruptions in one constraint-aware workspace—where each decision is clear and reviewable.</p>
          <div className="hero-actions"><Link className="button-primary" to={workspacePath}>{user ? 'Open workspace' : 'Access AXIOM'} <ArrowRight size={17} /></Link><a className="button-secondary" href="#features">Explore features <ArrowDown size={16} /></a></div>
          <div className="hero-caption"><Check size={15} /> Built around real campus constraints and role-specific workflows</div>
        </div>
        <div className="hero-visual" aria-label="Illustrative AXIOM workspace preview">
          <div className="visual-topline"><div className="visual-brand"><span className="public-brand-mark small">A</span><span>Campus workspace</span></div><span className="visual-status"><i /> Schedule workspace</span></div>
          <div className="visual-title"><div><small>OPERATIONS OVERVIEW</small><h2>Campus, in sync.</h2></div><span className="visual-date">WEEKLY VIEW</span></div>
          <div className="visual-board"><div className="visual-time-label">WEEK</div>{['MON', 'TUE', 'WED', 'THU', 'FRI'].map((day, i) => <div className="visual-day" key={day}><span>{day}</span><div className={`visual-block block-${i + 1}`} /><div className={`visual-block short block-${(i % 3) + 1}`} /></div>)}</div>
          <div className="visual-footer"><span><span className="visual-dot blue" /> Timetable</span><span><span className="visual-dot gold" /> Bookings</span><span className="visual-illustrative">Illustrative interface</span></div>
          <div className="visual-note"><ShieldCheck size={17} /><span><strong>Validated against constraints</strong><small>Review the schedule before it is approved</small></span></div>
        </div>
      </section>

      <section className="trust-strip"><span>ONE SHARED WORKSPACE</span><div><CalendarDays /> Scheduling</div><div><MapPin /> Venues</div><div><Clock3 /> Exams & disruptions</div><div><LockKeyhole /> Role-aware access</div></section>

      <section className="public-section feature-section" id="features"><div className="section-heading"><div><span className="public-eyebrow">A CLEAR VIEW OF CAMPUS OPERATIONS</span><h2>One system for the<br /><em>moving parts.</em></h2></div><p>Designed to keep schedules, spaces and decisions connected. Availability labels describe the current implementation, not a roadmap promise.</p></div>
        <div className="feature-grid">{featureItems.map(({ icon: Icon, title, text, state }, index) => <article className="feature-card" key={title}><div className="feature-card-top"><span className="feature-icon"><Icon size={18} /></span><span className={`feature-state${state !== 'Implemented' ? ' is-limited' : ''}`}>{state}</span></div><h3>{title}</h3><p>{text}</p><span className="feature-number">0{index + 1}</span></article>)}</div>
      </section>

      <section className="workflow-section" id="workflow"><div className="workflow-inner"><div className="workflow-heading"><span className="public-eyebrow">FROM INPUT TO REVIEW</span><h2>A workflow built<br />for <em>real constraints.</em></h2><p>Keep a human reviewer in control while the platform validates schedules and booking decisions.</p><Link className="text-link" to="/login">Sign in to your workspace <ArrowRight size={16} /></Link></div>
        <ol className="workflow-list">{['Load campus data', 'Generate a constraint-valid timetable', 'Process venue booking requests', 'Create disruption repair proposals', 'Review, approve and export decisions'].map((item, i) => <li key={item}><span className="workflow-index">0{i + 1}</span><div><strong>{item}</strong><small>{['Import a dataset and preserve its campus identifiers.', 'Use timetable and room constraints to build a schedule.', 'Apply deterministic priority and availability rules.', 'Compare a proposed change with the baseline schedule.', 'Keep approval and export actions explicit.'][i]}</small></div><Check className="workflow-check" size={16} /></li>)}</ol>
      </div></section>

      <section className="public-section role-section" id="roles"><div className="section-heading role-heading"><div><span className="public-eyebrow">THE RIGHT VIEW FOR EVERY ROLE</span><h2>Clear ownership.<br /><em>Shared context.</em></h2></div><p>Sign in with an assigned account. AXIOM reads permissions from the authenticated session, not from a role selector in the browser.</p></div>
        <div className="role-grid">{roles.map(({ icon: Icon, name, detail, role }) => <article className="role-card" key={role}><span className="role-icon"><Icon size={20} /></span><span className="role-access">ROLE ACCESS</span><h3>{name}</h3><p>{detail}</p><Link to="/login" aria-label={`Sign in as ${name}`}>Continue to sign in <ArrowRight size={15} /></Link></article>)}</div>
      </section>
      <section className="closing-cta"><div><span className="public-eyebrow">AXIOM CAMPUS WORKSPACE</span><h2>Bring the campus<br /><em>into alignment.</em></h2></div><Link className="button-primary" to={workspacePath}>{user ? 'Open workspace' : 'Access AXIOM'} <ArrowRight size={17} /></Link></section>
    </main>

    <footer className="public-footer"><Link className="public-brand" to="/"><span className="public-brand-mark">A</span><span>AXIOM<span className="brand-period">.</span></span></Link><p>Intelligent campus scheduling and venue management.</p><Link to="/login">Sign in <ArrowUpRight size={14} /></Link><small>Campus operations workspace</small></footer>
  </div>
}
