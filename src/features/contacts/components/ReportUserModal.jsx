import { useState } from 'react'
import { App, Form, Input, Modal, Select } from 'antd'
import { reportUser } from '@/features/contacts/api/contactsApi'
import { getErrorMessage } from '@/lib/firebaseErrors'

const REASONS = [
  { value: 'spam', label: 'Spam or unwanted messages' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Other' },
]

export default function ReportUserModal({ open, onClose, reporterUid, targetUser }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const { message } = App.useApp()

  const handleSubmit = async (values) => {
    if (!reporterUid || !targetUser?.uid) return
    setSubmitting(true)
    try {
      await reportUser({
        reporterUid,
        targetUid: targetUser.uid,
        targetUsername: targetUser.username,
        reason: values.reason,
        details: values.details || '',
      })
      message.success('Report submitted. Thank you for helping keep Chatly safe.')
      form.resetFields()
      onClose?.()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={`Report @${targetUser?.username || 'user'}`}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Submit report"
      okButtonProps={{ danger: true, loading: submitting }}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
        <Form.Item
          name="reason"
          label="Reason"
          rules={[{ required: true, message: 'Select a reason' }]}
        >
          <Select options={REASONS} placeholder="Why are you reporting this account?" />
        </Form.Item>
        <Form.Item name="details" label="Additional details (optional)">
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder="Share any context that might help..."
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

