import { useState } from 'react'
import { Alert, App, Button, Space } from 'antd'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { resendVerification } from '@/features/auth/api/authApi'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function VerifyEmailBanner() {
  const { user, emailVerified, reloadUser } = useAuth()
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)

  if (!user || emailVerified) return null

  const run = async (fn, okMsg) => {
    setBusy(true)
    try {
      await fn()
      if (okMsg) message.success(okMsg)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Alert
      type="warning"
      showIcon
      className="m-3"
      message={`Verify your email (${user.email})`}
      description="We sent you a verification link. Check your inbox and spam folder."
      action={
        <Space direction="vertical" size={4}>
          <Button size="small" loading={busy} onClick={() => run(resendVerification, 'Verification email sent')}>
            Resend
          </Button>
          <Button size="small" type="primary" loading={busy} onClick={() => run(reloadUser)}>
            I've verified
          </Button>
        </Space>
      }
    />
  )
}
