import { ArrowRight, Compass } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { AnimatedLink } from '../components/ui/AnimatedLink'

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
        <AnimatedLink to="/dashboard" variant="center" className="text-link">Back to overview <ArrowRight size={16} /></AnimatedLink>
      </section>
    </>
  )
}
