import { useMemo, useState } from 'react'
import { Avatar, Badge, Button, Dropdown, Empty, Input, Segmented, Skeleton, Tooltip } from 'antd'
import {
  AudioMutedOutlined,
  FolderOutlined,
  MoreOutlined,
  PlusOutlined,
  PushpinFilled,
  PushpinOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { toggleChatFlag } from '@/features/chats/api/chatsApi'
import { getActiveStatusNote } from '@/features/profile/api/profileApi'
import StoriesBar from '@/features/chats/components/StoriesBar'
import { cn, formatRelativeTime, getInitials, isUserOnline, toDate } from '@/lib/utils'

export function getChatDisplay(chat, currentUid) {
  if (!chat) return { title: 'Chat', avatar: null, otherUid: null, username: '', statusNote: null }
  if (chat.type === 'group') {
    return {
      title: chat.title || 'Group Chat',
      avatar: chat.avatarURL || undefined,
      otherUid: null,
      username: '',
      isGroup: true,
      online: false,
      statusNote: null,
    }
  }
  const otherUid = (chat.memberIds || []).find((id) => id !== currentUid) || currentUid
  const info = chat.memberInfo?.[otherUid] || {}
  return {
    title: info.displayName || info.username || 'User',
    avatar: info.photoURL || undefined,
    otherUid,
    username: info.username || '',
    isGroup: false,
    online: isUserOnline(info, true),
    statusNote: getActiveStatusNote(info),
  }
}

export function getActiveTypers(chat, currentUid) {
  if (!chat?.typing) return []
  const now = Date.now()
  const activeUids = Object.entries(chat.typing)
    .filter(([uid, ts]) => {
      if (uid === currentUid || !ts) return false
      const ms = typeof ts === 'number' ? ts : toDate(ts)?.getTime() || 0
      return now - ms < 8000
    })
    .map(([uid]) => chat.memberInfo?.[uid]?.displayName || 'Someone')
  return activeUids
}

export default function ChatSidebar({
  chats,
  loading,
  currentUid,
  selectedChatId,
  onSelectChat,
  onOpenNewChat,
  onOpenNewGroup,
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'unread' | 'groups' | 'archived'

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase()

    const list = chats.filter((chat) => {
      const isArchived = Array.isArray(chat.archivedBy) && chat.archivedBy.includes(currentUid)
      if (filter === 'archived') {
        if (!isArchived) return false
      } else if (isArchived) {
        return false
      }

      const unread = chat.unreadCounts?.[currentUid] || 0
      if (filter === 'unread' && unread <= 0) return false
      if (filter === 'groups' && chat.type !== 'group') return false

      if (q) {
        const { title, username } = getChatDisplay(chat, currentUid)
        const lastText = chat.lastMessage?.text || ''
        return (
          title.toLowerCase().includes(q) ||
          username.toLowerCase().includes(q) ||
          lastText.toLowerCase().includes(q)
        )
      }
      return true
    })

    // Sort pinned chats first, then by lastMessageAt desc
    return [...list].sort((a, b) => {
      const aPinned = Array.isArray(a.pinnedBy) && a.pinnedBy.includes(currentUid)
      const bPinned = Array.isArray(b.pinnedBy) && b.pinnedBy.includes(currentUid)
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      const aTime = toDate(a.lastMessageAt)?.getTime() || 0
      const bTime = toDate(b.lastMessageAt)?.getTime() || 0
      return bTime - aTime
    })
  }, [chats, search, filter, currentUid])

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--color-border)] md:w-80 lg:w-96 shrink-0">
      {/* Header */}
      <div className="space-y-3 p-3.5 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <h1 className="m-0 text-lg font-bold">Chats</h1>
          <div className="flex items-center gap-1.5">
            <Tooltip title="New 1:1 Chat">
              <Button
                size="small"
                icon={<UserAddOutlined />}
                onClick={onOpenNewChat}
              />
            </Tooltip>
            <Tooltip title="New Group">
              <Button
                size="small"
                type="primary"
                icon={<PlusOutlined />}
                onClick={onOpenNewGroup}
              >
                Group
              </Button>
            </Tooltip>
          </div>
        </div>

        <Input
          allowClear
          prefix={<SearchOutlined className="text-muted" />}
          placeholder="Search conversations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <Segmented
          block
          size="small"
          value={filter}
          onChange={setFilter}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Unread', value: 'unread' },
            { label: 'Groups', value: 'groups' },
            { label: 'Archived', value: 'archived' },
          ]}
        />
      </div>

      {/* 24-Hour Stories Bar & Custom Status Bubbles */}
      <StoriesBar onSelectChat={onSelectChat} />

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="space-y-3 p-3">
            <Skeleton avatar active paragraph={{ rows: 1 }} />
            <Skeleton avatar active paragraph={{ rows: 1 }} />
            <Skeleton avatar active paragraph={{ rows: 1 }} />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="grid h-64 place-items-center p-4">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                filter === 'archived'
                  ? 'No archived chats'
                  : filter === 'unread'
                    ? 'All caught up!'
                    : 'No conversations yet'
              }
            />
          </div>
        ) : (
          filteredChats.map((chat) => {
            const { title, avatar, isGroup, online, statusNote } = getChatDisplay(chat, currentUid)
            const unread = chat.unreadCounts?.[currentUid] || 0
            const isPinned = Array.isArray(chat.pinnedBy) && chat.pinnedBy.includes(currentUid)
            const isMuted = Array.isArray(chat.mutedBy) && chat.mutedBy.includes(currentUid)
            const isArchived =
              Array.isArray(chat.archivedBy) && chat.archivedBy.includes(currentUid)
            const isActive = chat.id === selectedChatId
            const typers = getActiveTypers(chat, currentUid)

            let subtitle = chat.lastMessage?.text || 'No messages yet'
            if (typers.length > 0) {
              subtitle =
                chat.type === 'group' ? `${typers[0]} is typing...` : 'typing...'
            } else if (chat.lastMessage) {
              const isMine = chat.lastMessage.senderId === currentUid
              if (isMine && chat.lastMessage.type !== 'system') {
                subtitle = `You: ${subtitle}`
              } else if (chat.type === 'group' && chat.lastMessage.senderName && chat.lastMessage.type !== 'system') {
                subtitle = `${chat.lastMessage.senderName}: ${subtitle}`
              }
            }

            const menuItems = [
              {
                key: 'pin',
                icon: <PushpinOutlined />,
                label: isPinned ? 'Unpin chat' : 'Pin chat',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation()
                  toggleChatFlag(chat.id, currentUid, 'pinnedBy', !isPinned)
                },
              },
              {
                key: 'mute',
                icon: <AudioMutedOutlined />,
                label: isMuted ? 'Unmute notifications' : 'Mute notifications',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation()
                  toggleChatFlag(chat.id, currentUid, 'mutedBy', !isMuted)
                },
              },
              {
                key: 'archive',
                icon: <FolderOutlined />,
                label: isArchived ? 'Unarchive chat' : 'Archive chat',
                onClick: ({ domEvent }) => {
                  domEvent.stopPropagation()
                  toggleChatFlag(chat.id, currentUid, 'archivedBy', !isArchived)
                },
              },
            ]

            return (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat.id)}
                className={cn(
                  'group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                  isActive
                    ? 'bg-primary/20 text-foreground'
                    : 'hover:bg-[var(--color-surface-raised)]',
                )}
              >
                <div className="relative shrink-0">
                  <Avatar
                    key={avatar || 'no-avatar'}
                    size={46}
                    src={avatar}
                    icon={isGroup && !avatar ? <TeamOutlined /> : undefined}
                    className="bg-primary font-semibold"
                  >
                    {!isGroup && getInitials(title)}
                  </Avatar>
                  {!isGroup && online && (
                    <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[var(--color-surface)] bg-emerald-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          'truncate text-sm',
                          unread > 0 ? 'font-bold' : 'font-medium',
                        )}
                      >
                        {title}
                      </span>
                      {statusNote && (
                        <Tooltip title={`${statusNote.emoji || ''} ${statusNote.text}`}>
                          <span className="max-w-24 shrink-0 truncate rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.2 text-[10px] text-foreground">
                            {statusNote.emoji} {statusNote.text}
                          </span>
                        </Tooltip>
                      )}
                    </div>
                    <span className="shrink-0 text-[11px] text-muted">
                      {formatRelativeTime(chat.lastMessageAt)}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'truncate text-xs',
                        typers.length > 0
                          ? 'text-primary font-medium italic'
                          : unread > 0
                            ? 'text-foreground font-medium'
                            : 'text-muted',
                      )}
                    >
                      {subtitle}
                    </span>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {isMuted && <AudioMutedOutlined className="text-xs text-muted" />}
                      {isPinned && <PushpinFilled className="text-xs text-primary" />}
                      {unread > 0 && (
                        <Badge
                          count={unread}
                          size="small"
                          style={{ backgroundColor: isMuted ? '#6b7280' : '#0a84ff' }}
                        />
                      )}
                      <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                        <Button
                          type="text"
                          size="small"
                          icon={<MoreOutlined />}
                          className="opacity-0 group-hover:opacity-100 !h-6 !w-6"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Dropdown>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}

