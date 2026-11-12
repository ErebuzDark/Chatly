import { useRef, useState } from 'react'
import { App, Avatar, Button, Checkbox, Empty, Form, Input, Modal } from 'antd'
import { CameraOutlined, TeamOutlined } from '@ant-design/icons'
import { uploadImage } from '@/services/cloudinary'
import { createGroupChat } from '@/features/chats/api/chatsApi'
import { getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function NewGroupModal({
  open,
  onClose,
  currentUser,
  contacts = [],
  onCreated,
}) {
  const [form] = Form.useForm()
  const { message } = App.useApp()
  const [avatarURL, setAvatarURL] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [selectedUids, setSelectedUids] = useState([])
  const [creating, setCreating] = useState(false)
  const fileRef = useRef(null)

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const res = await uploadImage(file, { folder: 'chatly/groups' })
      setAvatarURL(res.url)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const handleFinish = async (values) => {
    if (!currentUser?.uid) return
    setCreating(true)
    try {
      const memberProfiles = contacts.filter((c) => selectedUids.includes(c.uid))
      const chatId = await createGroupChat({
        creatorProfile: currentUser,
        title: values.title,
        description: values.description || '',
        avatarURL,
        memberProfiles,
      })
      message.success('Group created!')
      form.resetFields()
      setAvatarURL(null)
      setSelectedUids([])
      onCreated?.(chatId)
      onClose?.()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      title="Create Group Chat"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Create group"
      confirmLoading={creating || uploading}
      destroyOnClose
    >
      <div className="mb-4 flex items-center gap-3">
        <Avatar
          size={64}
          src={avatarURL}
          icon={!avatarURL ? <TeamOutlined /> : undefined}
          className="bg-primary"
        />
        <div>
          <Button
            size="small"
            icon={<CameraOutlined />}
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            Group photo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>
      </div>

      <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
        <Form.Item
          name="title"
          label="Group name"
          rules={[{ required: true, whitespace: true, max: 60, message: 'Enter a group name' }]}
        >
          <Input placeholder="e.g. Weekend Trip, Design Team..." maxLength={60} />
        </Form.Item>

        <Form.Item name="description" label="Description (optional)">
          <Input.TextArea rows={2} maxLength={200} placeholder="What is this group about?" />
        </Form.Item>

        <div className="space-y-2">
          <div className="text-sm font-medium">
            Add members ({selectedUids.length} selected)
          </div>
          {contacts.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No contacts yet. You can still create the group and share an invite link!"
            />
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)] p-2">
              {contacts.map((c) => {
                const checked = selectedUids.includes(c.uid)
                return (
                  <label
                    key={c.uid}
                    className="flex cursor-pointer items-center justify-between py-2 px-1"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar size={32} src={c.photoURL} className="bg-primary text-xs">
                        {getInitials(c.displayName)}
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium">{c.displayName}</div>
                        <div className="text-xs text-muted">@{c.username}</div>
                      </div>
                    </div>
                    <Checkbox
                      checked={checked}
                      onChange={(e) => {
                        setSelectedUids((prev) =>
                          e.target.checked
                            ? [...prev, c.uid]
                            : prev.filter((id) => id !== c.uid),
                        )
                      }}
                    />
                  </label>
                )
              })}
            </div>
          )}
        </div>
      </Form>
    </Modal>
  )
}

