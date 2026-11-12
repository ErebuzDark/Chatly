import { useState } from 'react'
import { App, Switch } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { updateUserProfile } from '@/features/profile/api/profileApi'
import { DEFAULT_VISIBILITY } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

const VISIBILITY_FIELDS = [
  { key: 'onlineStatus', label: 'Online status', desc: 'Show green dot when you are active' },
  { key: 'lastSeen', label: 'Last seen timestamp', desc: 'Show when you were last active' },
  { key: 'email', label: 'Email address', desc: 'Display your email on your profile' },
  { key: 'birthday', label: 'Birthday', desc: 'Display your birthday on your profile' },
  { key: 'location', label: 'Location', desc: 'Display your city/location on your profile' },
  { key: 'links', label: 'Website links', desc: 'Display your social or website links' },
]

export default function PrivacySettingsCard({ profile }) {
  const { message } = App.useApp()
  const [busyKey, setBusyKey] = useState(null)

  if (!profile) return null

  const visibility = { ...DEFAULT_VISIBILITY, ...profile.visibility }

  const handleTogglePrivate = async (checked) => {
    setBusyKey('isPrivate')
    try {
      await updateUserProfile(profile.uid, { isPrivate: checked })
      message.success(checked ? 'Account is now private' : 'Account is now public')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusyKey(null)
    }
  }

  const handleToggleField = async (key, checked) => {
    setBusyKey(key)
    try {
      const next = { ...visibility, [key]: checked }
      await updateUserProfile(profile.uid, { visibility: next })
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="glass rounded-lg p-5 space-y-5">
      <div className="flex items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 font-semibold">
            <LockOutlined className="text-primary" />
            <span>Private Account</span>
          </div>
          <p className="m-0 mt-1 text-xs text-muted">
            When enabled, non-contacts only see your name, @username, avatar, and the Add button.
          </p>
        </div>
        <Switch
          checked={!!profile.isPrivate}
          loading={busyKey === 'isPrivate'}
          onChange={handleTogglePrivate}
        />
      </div>

      <div className="space-y-3">
        <h3 className="m-0 text-sm font-semibold text-muted uppercase tracking-wider">
          Field Visibility
        </h3>
        {VISIBILITY_FIELDS.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 py-1">
            <div>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs text-muted">{item.desc}</div>
            </div>
            <Switch
              size="small"
              checked={!!visibility[item.key]}
              loading={busyKey === item.key}
              onChange={(checked) => handleToggleField(item.key, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

