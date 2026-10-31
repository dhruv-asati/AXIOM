import type { CSSProperties, ReactNode } from 'react'
import './Skeleton.css'

type SkeletonProps = { className?: string; width?: string | number; height?: string | number; rounded?: boolean }

export function Skeleton({ className = '', width, height, rounded = false }: SkeletonProps) {
  return <span
    aria-hidden="true"
    className={`axiom-skeleton${rounded ? ' is-rounded' : ''}${className ? ` ${className}` : ''}`}
    style={{ width, height }}
  />
}

export function SkeletonText({ lines = 2, className = '' }: { lines?: number; className?: string }) {
  return <span className={`skeleton-text ${className}`} aria-hidden="true">
    {Array.from({ length: lines }, (_, index) => <Skeleton key={index} className="skeleton-text-line" width={index === lines - 1 ? '68%' : '100%'} />)}
  </span>
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return <article className={`skeleton-card ${className}`} aria-hidden="true">
    <Skeleton width="38%" height={10} />
    <Skeleton width="48%" height={26} />
    <Skeleton width="72%" height={8} />
  </article>
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return <div className="skeleton-table" style={{ '--skeleton-columns': columns } as CSSProperties} aria-hidden="true">
    {Array.from({ length: rows }, (_, row) => <div className="skeleton-table-row" key={row}>
      {Array.from({ length: columns }, (_, column) => <Skeleton key={column} height={10} width={column === 0 ? '76%' : `${56 + ((row + column) % 4) * 10}%`} />)}
    </div>)}
  </div>
}

export function SkeletonChart() {
  return <div className="skeleton-chart" aria-hidden="true">
    <div className="skeleton-chart-bars">{[42, 65, 50, 82, 57, 72, 46, 90, 61, 74].map((height, index) => <Skeleton key={index} height={`${height}%`} rounded />)}</div>
    <Skeleton width="54%" height={8} />
  </div>
}

export function SkeletonTimetable({ days = 5, periods = 6 }: { days?: number; periods?: number }) {
  return <div className="skeleton-timetable-scroll" aria-hidden="true"><div className="skeleton-timetable" style={{ '--skeleton-days': days } as CSSProperties}>
    <div className="skeleton-timetable-row"><Skeleton />{Array.from({ length: days }, (_, index) => <Skeleton key={index} height={15} />)}</div>
    {Array.from({ length: periods }, (_, row) => <div className="skeleton-timetable-row" key={row}>
      <Skeleton height={24} />{Array.from({ length: days }, (_, column) => <span key={column} className="skeleton-timetable-cell">{(row + column) % 3 === 0 && <Skeleton height={30} />}</span>)}
    </div>)}
  </div></div>
}

export function SkeletonPage({ children, label = 'Loading content' }: { children: ReactNode; label?: string }) {
  return <div className="skeleton-page" role="status" aria-label={label} aria-busy="true">{children}</div>
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return <div className="ops-grid skeleton-stats" aria-hidden="true">{Array.from({ length: count }, (_, index) => <SkeletonCard key={index} />)}</div>
}
