import { Link, NavLink, Outlet } from 'react-router-dom'
import { Avatar, Badge } from 'antd'
import {
  MessageOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useChats, ChatsProvider } from '@/features/chats/hooks/useChats'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { cn, getInitials } from '@/lib/utils'
import AmbientBackground from '@/components/shared/AmbientBackground'
import VerifyEmailBanner from '@/components/shared/VerifyEmailBanner'

const linkClass = ({ isActive }) =>
  cn(
    'flex flex-col items-center justify-center gap-0.5 rounded-md text-xs transition-colors',
    isActive ? 'bg-primary/20 text-primary' : 'text-muted hover:text-foreground',
  )

function AppShellInner() {
  const { profile, user } = useAuth()
  const { totalUnread } = useChats()
  const { incomingRequests } = useContacts()
  const name = profile?.displayName ?? user?.displayName ?? ''

  const navItems = [
    {
      to: '/chats',
      label: 'Chats',
      icon: <MessageOutlined />,
      badge: totalUnread,
    },
    {
      to: '/contacts',
      label: 'Contacts',
      icon: <TeamOutlined />,
      badge: incomingRequests.length,
    },
    {
      to: '/profile',
      label: 'Profile',
      icon: <UserOutlined />,
      badge: 0,
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: <SettingOutlined />,
      badge: 0,
    },
  ]

  return (
    <div className="flex h-dvh md:gap-3 md:p-3">
      <AmbientBackground />

      {/* Desktop rail */}
      <nav className="glass hidden w-20 shrink-0 flex-col items-center gap-2 rounded-lg p-2 md:flex">
        <Link to="/profile" className="my-2">
          <Avatar src={profile?.photoURL} size={44} className="bg-primary">
            {getInitials(name)}
          </Avatar>
        </Link>

        {navItems.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={(s) => cn(linkClass(s), 'h-16 w-full text-lg')}
          >
            <Badge count={n.badge} size="small" offset={[6, -2]}>
              <span className="text-lg text-current">{n.icon}</span>
            </Badge>
            <span className="text-[11px]">{n.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="glass flex min-w-0 flex-1 flex-col overflow-hidden md:rounded-lg">
        <VerifyEmailBanner />
        <div className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </div>
      </main>

      {/* Mobile tab bar */}
      <nav className="glass fixed inset-x-0 bottom-0 z-20 flex justify-around border-x-0 border-b-0 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
        {navItems.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={(s) => cn(linkClass(s), 'h-14 flex-1 text-xl')}
          >
            <Badge count={n.badge} size="small" offset={[6, -2]}>
              <span className="text-xl text-current">{n.icon}</span>
            </Badge>
            <span className="text-[11px]">{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function AppShell() {
  return (
    <ChatsProvider>
      <AppShellInner />
    </ChatsProvider>
  )
}
