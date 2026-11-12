import { useEffect, useState } from 'react'
import { App, Avatar, Button, Empty, Input, Modal } from 'antd'
import { MessageOutlined, SearchOutlined } from '@ant-design/icons'
import { searchUsersByPrefix } from '@/features/contacts/api/contactsApi'
import { getOrCreateDirectChat } from '@/features/chats/api/chatsApi'
import { getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function NewChatModal({
  open,
  onClose,
  currentUser,
  contacts = [],
  onSelectChat,
}) {
  const { message } = App.useApp()
  const [queryText, setQueryText] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busyUid, setBusyUid] = useState(null)

  useEffect(() => {
    if (!open) {
      setQueryText('')
      setResults([])
      return undefined
    }
    const q = queryText.trim()
    if (!q || !currentUser?.uid) {
      setResults([])
      return undefined
    }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const found = await searchUsersByPrefix(q, currentUser.uid)
        setResults(found)
      } catch {
        // ignore
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [queryText, open, currentUser?.uid])

  const startConversation = async (target) => {
    if (!currentUser) return
    setBusyUid(target.uid)
    try {
      const chat = await getOrCreateDirectChat(currentUser, target)
      onSelectChat?.(chat.id)
      onClose?.()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusyUid(null)
    }
  }

  const listToDisplay = queryText.trim() ? results : contacts

  return (
    <Modal
      title="New Message"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <div className="space-y-3">
        <Input
          allowClear
          prefix={<SearchOutlined className="text-muted" />}
          placeholder="Search contacts or type @username..."
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
        />

        <div className="max-h-72 overflow-y-auto divide-y divide-[var(--color-border)]">
          {listToDisplay.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                searching
                  ? 'Searching...'
                  : queryText.trim()
                    ? 'No matching users'
                    : 'No contacts yet — type a username above to find anyone!'
              }
            />
          ) : (
            listToDisplay.map((u) => (
              <div
                key={u.uid}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar size={38} src={u.photoURL} className="bg-primary">
                    {getInitials(u.displayName)}
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium">{u.displayName}</div>
                    <div className="text-xs text-muted">@{u.username}</div>
                  </div>
                </div>
                <Button
                  size="small"
                  type="primary"
                  icon={<MessageOutlined />}
                  loading={busyUid === u.uid}
                  onClick={() => startConversation(u)}
                >
                  Chat
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}

