import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  description: string
  eyebrow?: string
  action?: ReactNode
  className?: string
}

export function PageHeader({ title, description, eyebrow, action, className }: PageHeaderProps) {
  return (
    <header className={className ? `page-header ${className}` : 'page-header'}>
      <div>
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </header>
  )
}
