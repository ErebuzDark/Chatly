import { useState } from 'react'
import { App, Button, Form, Input, Modal, Switch } from 'antd'
import { BarChartOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function CreatePollModal({ open, onClose, onCreatePoll }) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const [submitting, setSubmitting] = useState(false)

  const handleFinish = async (values) => {
    const cleanOptions = (values.options || [])
      .map((o) => (o || '').trim())
      .filter(Boolean)

    if (cleanOptions.length < 2) {
      message.warning('Please enter at least 2 poll options')
      return
    }

    setSubmitting(true)
    try {
      await onCreatePoll?.({
        question: values.question.trim(),
        options: cleanOptions,
        allowMultiple: !!values.allowMultiple,
      })
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
      title={
        <span className="flex items-center gap-2">
          <BarChartOutlined className="text-primary" />
          <span>Create Group Poll</span>
        </span>
      }
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Create poll"
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ options: ['', ''], allowMultiple: true }}
        onFinish={handleFinish}
        requiredMark={false}
      >
        <Form.Item
          name="question"
          label="Question"
          rules={[
            {
              required: true,
              whitespace: true,
              max: 200,
              message: 'Enter a poll question',
            },
          ]}
        >
          <Input placeholder="Ask the group a question..." maxLength={200} />
        </Form.Item>

        <Form.List name="options">
          {(fields, { add, remove }) => (
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Options ({fields.length}/8)
                </span>
                {fields.length < 8 && (
                  <Button
                    type="link"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => add('')}
                  >
                    Add option
                  </Button>
                )}
              </div>

              {fields.map((field, index) => (
                <div key={field.key} className="flex items-center gap-2">
                  <Form.Item
                    {...field}
                    noStyle
                    rules={[
                      {
                        required: index < 2,
                        whitespace: true,
                        message: 'Option cannot be empty',
                      },
                    ]}
                  >
                    <Input
                      placeholder={`Option ${index + 1}`}
                      maxLength={100}
                    />
                  </Form.Item>
                  {fields.length > 2 && (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Form.List>

        <Form.Item
          name="allowMultiple"
          label="Allow members to vote for multiple options"
          valuePropName="checked"
          className="mb-0"
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  )
}

