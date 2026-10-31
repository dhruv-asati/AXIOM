import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth, type UserRole } from './AuthContext'
import { canAccessRole } from './roleAccess.mjs'
import { SkeletonCard, SkeletonPage } from '../components/ui/Skeleton'

export function ProtectedRoute({ roles }: { roles?: readonly UserRole[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="auth-loading"><SkeletonPage label="Restoring secure session"><SkeletonCard /><SkeletonCard /></SkeletonPage></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !canAccessRole(user.role, roles)) return <Navigate to="/forbidden" replace />
  return <Outlet />
}
