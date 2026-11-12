import { useState } from 'react'
import { App, Avatar, Button, Empty, Input, Modal } from 'antd'
import { SearchOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons'
import { getChatDisplay } from '@/features/chats/components/ChatSidebar'
import { sendMessage } from '@/features/chats/api/chatsApi'
import { getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function ForwardMessageModal({
  open,
  onClose,
  messageToForward,
  chats,
  currentUser,
}) {
  const { message } = App.useApp()
  const [search, setSearch] = useState('')
  const [sendingId, setSendingId] = useState(null)

  if (!messageToForward || !currentUser) return null

  const filtered = chats.filter((c) => {
    const { title } = getChatDisplay(c, currentUser.uid)
    return title.toLowerCase().includes(search.trim().toLowerCase())
  })

  const handleForward = async (targetChat) => {
    setSendingId(targetChat.id)
    try {
      await sendMessage({
        chatId: targetChat.id,
        senderProfile: currentUser,
        text: messageToForward.text || '',
        type: messageToForward.type === 'system' ? 'text' : messageToForward.type,
        attachments: messageToForward.attachments || [],
        forwardedFrom: { senderName: messageToForward.senderName || 'User' },
        memberIds: targetChat.memberIds || [],
      })
      const { title } = getChatDisplay(targetChat, currentUser.uid)
      message.success(`Forwarded to ${title}`)
      onClose?.()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSendingId(null)
    }
  }

  return (
    <Modal
      title="Forward message"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <div className="space-y-3">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-muted" />}
          placeholder="Search chat to forward to..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-border)]">
          {filtered.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No chats found" />
          ) : (
            filtered.map((c) => {
              const { title, avatar, isGroup } = getChatDisplay(c, currentUser.uid)
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      size={36}
                      src={avatar}
                      icon={isGroup && !avatar ? <TeamOutlined /> : undefined}
                      className="bg-primary shrink-0"
                    >
                      {!isGroup && getInitials(title)}
                    </Avatar>
                    <span className="truncate text-sm font-medium">{title}</span>
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    icon={<SendOutlined />}
                    loading={sendingId === c.id}
                    onClick={() => handleForward(c)}
                  >
                    Send
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Modal>
  )
}

