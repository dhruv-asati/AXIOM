import { ArrowRight, Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'

type PlaceholderPageProps = {
  title: string
  description: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <>
      <PageHeader eyebrow="CAMPUS OPERATIONS" title={title} description={description} />
      <section className="section-placeholder">
        <span className="placeholder-icon"><Compass size={22} strokeWidth={1.6} /></span>
        <p className="section-eyebrow">WORKSPACE IN PROGRESS</p>
        <h2>This area is being prepared.</h2>
        <p className="placeholder-description">The {title.toLowerCase()} workspace will take shape here as this part of AXIOM is developed.</p>
        <Link to="/dashboard" className="text-link">Back to overview <ArrowRight size={16} /></Link>
      </section>
    </>
  )
}
