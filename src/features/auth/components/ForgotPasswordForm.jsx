import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, Button, Form, Input } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import { resetPassword } from '@/features/auth/api/authApi'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const { message } = App.useApp()

  const onFinish = async ({ email }) => {
    setLoading(true)
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      // Don't reveal whether an email exists.
      if (err?.code === 'auth/user-not-found') setSent(true)
      else message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="mt-0 mb-1 text-lg font-semibold">Reset password</h2>
      <p className="mt-0 mb-5 text-sm text-muted">We'll email you a link to set a new one.</p>
      {sent ? (
        <Alert type="success" showIcon message="If that email has an account, a reset link is on its way." />
      ) : (
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
            <Input prefix={<MailOutlined />} placeholder="you@example.com" autoComplete="email" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Send reset link
          </Button>
        </Form>
      )}
      <p className="mt-5 mb-0 text-center text-sm">
        <Link to="/login">Back to sign in</Link>
      </p>
    </>
  )
}
