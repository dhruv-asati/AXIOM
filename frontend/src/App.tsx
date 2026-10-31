import { useEffect, useState } from 'react'
import './App.css'
import { checkApiHealth } from './api/health'


function App() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')

  useEffect(() => {
    checkApiHealth()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'))
  }, [])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="AXIOM home"><span className="brand-mark">A</span> AXIOM</a>
        <div className="nav-label">WORKSPACE</div>
        <a className="nav-item active" href="#dashboard"><span>▦</span> Overview</a>
        <div className="sidebar-bottom"><span className={`status-dot ${apiStatus}`} />
          <div><strong>API {apiStatus === 'checking' ? 'connecting' : apiStatus}</strong><small>Local development</small></div>
        </div>
      </aside>
      <main className="main-content" id="dashboard">
        <header className="topbar"><span>Campus operations</span><div className="avatar">D</div></header>
        <section className="welcome">
          <div className="eyebrow">INTELLIGENT CAMPUS PLATFORM</div>
          <h1>Good to see you, Dhruv.</h1>
          <p>Your campus scheduling workspace is ready to take shape.</p>
        </section>
        <section className="panel">
          <div className="panel-icon">✦</div>
          <div><span className="badge">FOUNDATION</span><h2>Welcome to AXIOM</h2>
            <p>This workspace is the starting point for campus timetables, venue bookings, and operational updates.</p>
          </div>
        </section>
        <div className="section-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>At a glance</h2></div><span className="muted">Getting started</span></div>
        <div className="cards">
          <article className="stat-card"><div className="card-symbol indigo">▦</div><span className="card-label">TIMETABLES</span><strong>Coming soon</strong><small>Schedule overview</small></article>
          <article className="stat-card"><div className="card-symbol teal">⌂</div><span className="card-label">VENUES</span><strong>Coming soon</strong><small>Campus spaces</small></article>
          <article className="stat-card"><div className="card-symbol amber">◷</div><span className="card-label">REQUESTS</span><strong>Coming soon</strong><small>Bookings & updates</small></article>
        </div>
        <footer>AXIOM <span>·</span> Campus scheduling and venue management</footer>
      </main>
    </div>
  )
}

export default App



