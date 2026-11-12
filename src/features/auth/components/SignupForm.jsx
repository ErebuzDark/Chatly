import { useState } from 'react'
import { Link } from 'react-router-dom'
import { App, Button, Form, Input } from 'antd'
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { isUsernameAvailable, signUp, USERNAME_RE } from '@/features/auth/api/authApi'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function SignupForm() {
  const [loading, setLoading] = useState(false)
  const { message } = App.useApp()

  const onFinish = async (values) => {
    setLoading(true)
    try {
      await signUp(values) // PublicOnlyRoute redirects once auth state updates
      message.success('Account created. Check your email to verify it.')
    } catch (err) {
      message.error(getErrorMessage(err))
      setLoading(false)
    }
  }

  return (
    <>
      <h2 className="mt-0 mb-1 text-lg font-semibold">Create your account</h2>
      <p className="mt-0 mb-5 text-sm text-muted">Pick a username so friends can find you.</p>
      <Form layout="vertical" onFinish={onFinish} requiredMark={false} autoComplete="on">
        <Form.Item name="displayName" label="Name" rules={[{ required: true, whitespace: true, max: 50, message: 'Enter your name' }]}>
          <Input prefix={<UserOutlined />} placeholder="Your name" autoComplete="name" />
        </Form.Item>

        <Form.Item
          name="username"
          label="Username"
          normalize={(v) => (v ?? '').toLowerCase().replace(/\s/g, '')}
          validateTrigger={['onChange', 'onBlur']}
          rules={[
            { required: true, message: 'Choose a username' },
            { pattern: USERNAME_RE, message: '3–20 characters: a–z, 0–9, _ and .' },
            {
              validateTrigger: 'onBlur',
              validator: async (_, value) => {
                if (!value || !USERNAME_RE.test(value)) return
                if (!(await isUsernameAvailable(value))) throw new Error('That username is taken')
              },
            },
          ]}
        >
          <Input prefix="@" placeholder="username" autoComplete="username" />
        </Form.Item>

        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input prefix={<MailOutlined />} placeholder="you@example.com" autoComplete="email" />
        </Form.Item>

        <Form.Item name="password" label="Password" rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          name="confirm"
          label="Confirm password"
          dependencies={['password']}
          rules={[
            { required: true, message: 'Confirm your password' },
            ({ getFieldValue }) => ({
              validator: (_, v) => (!v || getFieldValue('password') === v ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))),
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={loading}>
          Create account
        </Button>
      </Form>
      <p className="mt-5 mb-0 text-center text-sm text-muted">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </>
  )
}
