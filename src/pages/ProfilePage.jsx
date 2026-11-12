import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Avatar, Button, Skeleton, Tabs, Tag } from 'antd'
import {
  CalendarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { getInitials } from '@/lib/utils'
import EditProfileModal from '@/features/profile/components/EditProfileModal'
import PrivacySettingsCard from '@/features/profile/components/PrivacySettingsCard'
import ProfileWall from '@/features/profile/components/ProfileWall'

export default function ProfilePage() {
  const { profile, user } = useAuth()
  const { message } = App.useApp()
  const [editOpen, setEditOpen] = useState(false)

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton avatar active paragraph={{ rows: 4 }} />
      </div>
    )
  }

  const copyPublicLink = () => {
    const url = `${window.location.origin}/u/${profile.username}`
    navigator.clipboard.writeText(url)
    message.success('Profile link copied to clipboard')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      {/* Header Card with Cover + Avatar */}
      <div className="glass overflow-hidden rounded-lg">
        <div
          className="h-36 sm:h-48 w-full bg-gradient-to-r from-primary/35 via-secondary/35 to-primary/20"
          style={
            profile.coverURL
              ? {
                  backgroundImage: `url(${profile.coverURL})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        />

        <div className="px-5 pb-5">
          <div className="-mt-12 mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="relative">
              <Avatar
                size={96}
                src={profile.photoURL}
                className="border-4 border-[var(--color-surface)] bg-primary text-2xl font-semibold shadow-lg"
              >
                {getInitials(profile.displayName)}
              </Avatar>
              <span
                title="Online"
                className="absolute right-1.5 bottom-1.5 h-4 w-4 rounded-full border-2 border-[var(--color-surface)] bg-emerald-500"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button icon={<ShareAltOutlined />} onClick={copyPublicLink}>
                Share
              </Button>
              <Link to={`/u/${profile.username}`}>
                <Button icon={<EyeOutlined />}>View as public</Button>
              </Link>
              <Button type="primary" icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Edit profile
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-2xl font-bold">{profile.displayName}</h1>
              {profile.isPrivate && (
                <Tag icon={<LockOutlined />} color="blue">
                  Private
                </Tag>
              )}
            </div>
            <p className="m-0 text-sm text-muted">@{profile.username}</p>

            {profile.bio && (
              <p className="m-0 pt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {profile.bio}
              </p>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-2 text-xs text-muted">
              {(profile.email || user?.email) && (
                <span className="flex items-center gap-1.5">
                  <MailOutlined /> {profile.email || user?.email}
                </span>
              )}
              {profile.location && (
                <span className="flex items-center gap-1.5">
                  <EnvironmentOutlined /> {profile.location}
                </span>
              )}
              {profile.birthday && (
                <span className="flex items-center gap-1.5">
                  <CalendarOutlined /> Born {profile.birthday}
                </span>
              )}
            </div>

            {Array.isArray(profile.links) && profile.links.length > 0 && (
              <div className="flex flex-wrap gap-3 pt-1 text-xs">
                {profile.links.map((link, idx) => (
                  <a
                    key={idx}
                    href={link.startsWith('http') ? link : `https://${link}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline"
                  >
                    <LinkOutlined />
                    {link.replace(/^https?:\/\//, '')}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: Wall & Privacy */}
      <Tabs
        defaultActiveKey="wall"
        items={[
          {
            key: 'wall',
            label: 'Wall & Status',
            children: (
              <ProfileWall
                profileOwner={profile}
                currentUserUid={profile.uid}
                canPost
              />
            ),
          },
          {
            key: 'privacy',
            label: 'Privacy & Visibility',
            children: <PrivacySettingsCard profile={profile} />,
          },
        ]}
      />

      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={profile}
      />
    </div>
  )
}
