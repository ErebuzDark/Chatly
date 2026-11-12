import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Form, Input } from 'antd'
import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { signIn } from '@/features/auth/api/authApi'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function LoginForm() {
  const [loading, setLoading] = useState(false)
  const { message } = App.useApp()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await signIn(values) // PublicOnlyRoute redirects once auth state updates
    } catch (err) {
      message.error(getErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="mt-0 mb-1 text-lg font-semibold">Welcome back</h2>
      <p className="mt-0 mb-5 text-sm text-muted">Sign in to continue chatting.</p>
      <Form layout="vertical" onFinish={onFinish} requiredMark={false} autoComplete="on">
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input prefix={<MailOutlined />} placeholder="you@example.com" autoComplete="email" />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <div className="-mt-3 mb-4 text-right text-sm">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="primary" htmlType="submit" block loading={loading}>
          Sign in
        </Button>
      </Form>
      <p className="mt-5 mb-0 text-center text-sm text-muted">
        New here? <Link to="/signup">Create an account</Link>
      </p>
    </>
  )
}
