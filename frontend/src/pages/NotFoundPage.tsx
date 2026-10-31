import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="not-found-page">
      <span className="not-found-code">404</span>
      <p className="section-eyebrow">PAGE NOT FOUND</p>
      <h1>We couldn’t find that workspace.</h1>
      <p className="placeholder-description">The address may have changed, or the page may not exist.</p>
      <Link to="/dashboard" className="text-link"><ArrowLeft size={16} /> Return to overview</Link>
    </section>
  )
}
