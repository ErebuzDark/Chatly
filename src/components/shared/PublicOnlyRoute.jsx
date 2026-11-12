import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import PageLoader from '@/components/shared/PageLoader'

export default function PublicOnlyRoute() {
  const { user, authReady } = useAuth()
  const location = useLocation()

  if (!authReady) return <PageLoader />
  if (user) return <Navigate to={location.state?.from?.pathname ?? '/chats'} replace />
  return <Outlet />
}
