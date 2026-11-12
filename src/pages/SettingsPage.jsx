import { useState } from 'react'
import {
  App,
  Button,
  Input,
  Modal,
  Segmented,
  Switch,
  Tag,
} from 'antd'
import {
  BellOutlined,
  DeleteOutlined,
  KeyOutlined,
  LogoutOutlined,
  SoundOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useTheme } from '@/store/ThemeProvider'
import { resetPassword, signOut } from '@/features/auth/api/authApi'
import {
  deleteAccountAndData,
  updateUserProfile,
} from '@/features/profile/api/profileApi'
import PrivacySettingsCard from '@/features/profile/components/PrivacySettingsCard'
import { playNotificationSound } from '@/services/sound'
import { DEFAULT_SETTINGS } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function SettingsPage() {
  const { user, profile, emailVerified } = useAuth()
  const { mode, setMode } = useTheme()
  const { modal, message } = App.useApp()

  const [busyKey, setBusyKey] = useState(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  const settings = { ...DEFAULT_SETTINGS, ...profile?.settings }

  const updateSetting = async (key, val) => {
    if (!profile?.uid) return
    setBusyKey(key)
    try {
      if (
        key === 'desktopNotifications' &&
        val &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'default'
      ) {
        await Notification.requestPermission()
      }
      await updateUserProfile(profile.uid, {
        settings: { ...settings, [key]: val },
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusyKey(null)
    }
  }

  const handlePasswordReset = async () => {
    if (!user?.email) return
    setBusyKey('reset')
    try {
      await resetPassword(user.email)
      message.success(`Password reset link sent to ${user.email}`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusyKey(null)
    }
  }

  const confirmLogout = () =>
    modal.confirm({
      title: 'Log out?',
      okText: 'Log out',
      okButtonProps: { danger: true },
      onOk: signOut,
    })

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      message.warning('Enter your password to confirm account deletion')
      return
    }
    setDeleting(true)
    try {
      await deleteAccountAndData(deletePassword)
      message.success('Your account and data have been permanently deleted.')
      setDeleteModalOpen(false)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="m-0 text-xl font-semibold">Settings</h1>
        <p className="m-0 text-xs text-muted">
          Customize appearance, notifications, privacy, and account security.
        </p>
      </div>

      {/* Appearance */}
      <section className="glass rounded-lg p-5 space-y-3">
        <h2 className="m-0 text-base font-semibold">Appearance</h2>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted">Color theme</span>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { label: 'Dark', value: 'dark' },
              { label: 'Light', value: 'light' },
            ]}
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="glass rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <BellOutlined className="text-primary" />
            <span>Notifications & Sounds</span>
          </div>
          <Button
            size="small"
            icon={<SoundOutlined />}
            onClick={playNotificationSound}
          >
            Test chime
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">In-app notification popups</div>
            <div className="text-xs text-muted">
              Show a banner when a message arrives in another chat
            </div>
          </div>
          <Switch
            size="small"
            checked={settings.inAppNotifications !== false}
            loading={busyKey === 'inAppNotifications'}
            onChange={(v) => updateSetting('inAppNotifications', v)}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Notification sounds</div>
            <div className="text-xs text-muted">
              Play chime on incoming messages and subtle pop on send
            </div>
          </div>
          <Switch
            size="small"
            checked={settings.soundEnabled !== false}
            loading={busyKey === 'soundEnabled'}
            onChange={(v) => updateSetting('soundEnabled', v)}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">Background tab notifications</div>
            <div className="text-xs text-muted">
              Show desktop notification when the tab is in the background
            </div>
          </div>
          <Switch
            size="small"
            checked={!!settings.desktopNotifications}
            loading={busyKey === 'desktopNotifications'}
            onChange={(v) => updateSetting('desktopNotifications', v)}
          />
        </div>
      </section>

      {/* Privacy & Field Visibility */}
      <PrivacySettingsCard profile={profile} />

      {/* Account & Security */}
      <section className="glass rounded-lg p-5 space-y-4">
        <h2 className="m-0 text-base font-semibold">Account & Security</h2>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <div className="font-medium">{profile?.displayName} (@{profile?.username})</div>
            <div className="text-xs text-muted">{user?.email}</div>
          </div>
          <Tag color={emailVerified ? 'green' : 'orange'}>
            {emailVerified ? 'Email verified' : 'Email not verified'}
          </Tag>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            icon={<KeyOutlined />}
            loading={busyKey === 'reset'}
            onClick={handlePasswordReset}
          >
            Send password reset email
          </Button>
          <Button icon={<LogoutOutlined />} onClick={confirmLogout}>
            Log out
          </Button>
        </div>

        <div className="border-t border-[var(--color-border)] pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-red-400">Delete Account</div>
              <div className="text-xs text-muted">
                Permanently remove your account, @username reservation, profile, and contacts.
              </div>
            </div>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setDeletePassword('')
                setDeleteModalOpen(true)
              }}
            >
              Delete account
            </Button>
          </div>
        </div>
      </section>

      <Modal
        title="Delete your account permanently?"
        open={deleteModalOpen}
        onCancel={() => setDeleteModalOpen(false)}
        onOk={handleDeleteAccount}
        okText="Permanently delete"
        okButtonProps={{ danger: true, loading: deleting }}
        destroyOnClose
      >
        <div className="space-y-3">
          <p className="m-0 text-sm text-muted">
            This action cannot be undone. Your username <b>@{profile?.username}</b> will be
            released and your profile, wall posts, and contacts will be erased.
          </p>
          <Input.Password
            placeholder="Enter your password to confirm"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
