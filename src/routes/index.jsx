import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppShell from '@/components/shared/AppShell'
import ErrorBoundary from '@/components/shared/ErrorBoundary'
import PageLoader from '@/components/shared/PageLoader'
import ProtectedRoute from '@/components/shared/ProtectedRoute'
import PublicOnlyRoute from '@/components/shared/PublicOnlyRoute'
import AuthLayout from '@/features/auth/components/AuthLayout'

const page = (factory) => {
  const Page = lazy(factory)
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    errorElement: <ErrorBoundary />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: 'login', element: page(() => import('@/pages/LoginPage')) },
              { path: 'signup', element: page(() => import('@/pages/SignupPage')) },
              { path: 'forgot-password', element: page(() => import('@/pages/ForgotPasswordPage')) },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <Navigate to="/chats" replace /> },
              { path: 'chats', element: page(() => import('@/pages/ChatsPage')) },
              { path: 'contacts', element: page(() => import('@/pages/ContactsPage')) },
              { path: 'profile', element: page(() => import('@/pages/ProfilePage')) },
              { path: 'u/:username', element: page(() => import('@/pages/UserProfilePage')) },
              { path: 'join/:inviteCode', element: page(() => import('@/pages/JoinGroupPage')) },
              { path: 'settings', element: page(() => import('@/pages/SettingsPage')) },
            ],
          },
        ],
      },
      { path: '*', element: page(() => import('@/pages/NotFoundPage')) },
    ],
  },
])
