import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import {
  App,
  Avatar,
  Button,
  Empty,
  Input,
  Popover,
  Skeleton,
  Tooltip,
} from 'antd'
import {
  ArrowLeftOutlined,
  CloseOutlined,
  InfoCircleOutlined,
  MessageOutlined,
  PushpinFilled,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { db } from '@/lib/firebase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useChats } from '@/features/chats/hooks/useChats'
import { useChatMessages } from '@/features/chats/hooks/useChatMessages'
import {
  deleteMessageForMe,
  editMessage,
  markChatRead,
  sendMessage,
  sendPollMessage,
  toggleClosePoll,
  togglePinMessage,
  toggleReaction,
  unsendMessage,
  voteInPoll,
} from '@/features/chats/api/chatsApi'
import ChatSidebar, {
  getActiveTypers,
  getChatDisplay,
} from '@/features/chats/components/ChatSidebar'
import MessageBubble from '@/features/chats/components/MessageBubble'
import MessageComposer from '@/features/chats/components/MessageComposer'
import NewGroupModal from '@/features/chats/components/NewGroupModal'
import NewChatModal from '@/features/chats/components/NewChatModal'
import ForwardMessageModal from '@/features/chats/components/ForwardMessageModal'
import ChatInfoDrawer from '@/features/chats/components/ChatInfoDrawer'
import CreatePollModal from '@/features/chats/components/CreatePollModal'
import { playSendSound } from '@/services/sound'
import {
  DEFAULT_SETTINGS,
  formatDateDivider,
  formatPresenceLabel,
  getInitials,
  isUserOnline,
  toDate,
} from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function ChatsPage() {
  const { profile: currentUser } = useAuth()
  const { contacts, blocks } = useContacts()
  const { chats, loading: chatsLoading, setActiveChatId } = useChats()
  const { message } = App.useApp()
  const [searchParams, setSearchParams] = useSearchParams()

  const selectedChatId = searchParams.get('chatId')
  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) || null,
    [chats, selectedChatId],
  )

  const {
    messages,
    loading: messagesLoading,
    loadingOlder,
    hasMore,
    loadOlder,
  } = useChatMessages(selectedChatId)

  const [otherUserDoc, setOtherUserDoc] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [forwardTarget, setForwardTarget] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [inChatQuery, setInChatQuery] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [pollModalOpen, setPollModalOpen] = useState(false)

  const listRef = useRef(null)
  const prevMsgCountRef = useRef(0)

  const selectChat = (id) => {
    if (id) setSearchParams({ chatId: id })
    else setSearchParams({})
    setReplyTo(null)
    setEditingMessage(null)
    setSearchOpen(false)
    setInChatQuery('')
  }

  // Inform global ChatsProvider which chat is currently open
  useEffect(() => {
    setActiveChatId(selectedChatId || null)
    return () => setActiveChatId(null)
  }, [selectedChatId, setActiveChatId])

  // Subscribe to other user's doc in 1:1 chat for live online/last-seen presence & profile sync
  const otherUid = useMemo(() => {
    if (!selectedChat || selectedChat.type === 'group' || !currentUser?.uid) return null
    return (selectedChat.memberIds || []).find((id) => id !== currentUser.uid) || null
  }, [selectedChat, currentUser?.uid])

  useEffect(() => {
    if (!otherUid) {
      setOtherUserDoc(null)
      return undefined
    }
    return onSnapshot(
      doc(db, 'users', otherUid),
      (snap) => {
        const data = snap.exists() ? { id: snap.id, ...snap.data() } : null
        setOtherUserDoc(data)
        if (data && selectedChat?.id) {
          const cached = selectedChat.memberInfo?.[otherUid]
          if (
            cached &&
            (cached.photoURL !== (data.photoURL || null) ||
              cached.displayName !== data.displayName)
          ) {
            updateDoc(doc(db, 'chats', selectedChat.id), {
              [`memberInfo.${otherUid}.photoURL`]: data.photoURL || null,
              [`memberInfo.${otherUid}.displayName`]: data.displayName,
            }).catch(() => {})
          }
        }
      },
      () => setOtherUserDoc(null),
    )
  }, [otherUid, selectedChat?.id, selectedChat?.memberInfo])

  // Mark chat read when viewing messages
  const unreadInSelected = selectedChat?.unreadCounts?.[currentUser?.uid] || 0
  useEffect(() => {
    if (selectedChatId && currentUser?.uid && (unreadInSelected > 0 || messages.length > 0)) {
      markChatRead(selectedChatId, currentUser.uid)
    }
  }, [selectedChatId, currentUser?.uid, unreadInSelected, messages.length])

  // Auto-scroll to bottom when new recent messages arrive
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (messages.length > prevMsgCountRef.current) {
      el.scrollTop = el.scrollHeight
    }
    prevMsgCountRef.current = messages.length
  }, [messages.length, selectedChatId])

  const visibleMessages = useMemo(() => {
    if (!currentUser?.uid) return []
    const q = inChatQuery.trim().toLowerCase()
    return messages.filter((m) => {
      if (Array.isArray(m.deletedFor) && m.deletedFor.includes(currentUser.uid)) {
        return false
      }
      if (q && !(m.text || '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [messages, currentUser?.uid, inChatQuery])

  const pinnedMessages = useMemo(
    () => (Array.isArray(selectedChat?.pinnedMessages) ? selectedChat.pinnedMessages : []),
    [selectedChat?.pinnedMessages],
  )
  const pinnedIds = useMemo(
    () => new Set(pinnedMessages.map((p) => p.id)),
    [pinnedMessages],
  )

  const handleSend = async ({ text, type, attachments }) => {
    if (!selectedChat || !currentUser) return
    await sendMessage({
      chatId: selectedChat.id,
      senderProfile: currentUser,
      text,
      type,
      attachments,
      replyTo,
      memberIds: selectedChat.memberIds || [],
    })
    setReplyTo(null)
    const settings = { ...DEFAULT_SETTINGS, ...currentUser.settings }
    if (settings.soundEnabled !== false) playSendSound()
  }

  const handleCreatePoll = async ({ question, options, allowMultiple }) => {
    if (!selectedChat || selectedChat.type !== 'group' || !currentUser) return
    await sendPollMessage({
      chatId: selectedChat.id,
      senderProfile: currentUser,
      question,
      options,
      allowMultiple,
      memberIds: selectedChat.memberIds || [],
    })
    const settings = { ...DEFAULT_SETTINGS, ...currentUser.settings }
    if (settings.soundEnabled !== false) playSendSound()
  }

  const handleVotePoll = async (msg, optionId) => {
    if (!selectedChat || !currentUser?.uid) return
    try {
      await voteInPoll({
        chatId: selectedChat.id,
        message: msg,
        optionId,
        uid: currentUser.uid,
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleToggleClosePoll = async (msg, closed) => {
    if (!selectedChat) return
    try {
      await toggleClosePoll({
        chatId: selectedChat.id,
        messageId: msg.id,
        closed,
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleSaveEdit = async (messageId, newText) => {
    if (!selectedChat) return
    try {
      await editMessage({ chatId: selectedChat.id, messageId, newText })
      setEditingMessage(null)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleUnsend = async (msg) => {
    if (!selectedChat) return
    try {
      await unsendMessage({ chatId: selectedChat.id, messageId: msg.id })
      message.success('Message unsent')
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleDeleteForMe = async (msg) => {
    if (!selectedChat || !currentUser?.uid) return
    try {
      await deleteMessageForMe({
        chatId: selectedChat.id,
        messageId: msg.id,
        uid: currentUser.uid,
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleReaction = async (msg, emoji, hasReacted) => {
    if (!selectedChat || !currentUser?.uid) return
    try {
      await toggleReaction({
        chatId: selectedChat.id,
        messageId: msg.id,
        emoji,
        uid: currentUser.uid,
        hasReacted,
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleTogglePin = async (msg, isPinned) => {
    if (!selectedChat || !currentUser?.uid) return
    try {
      await togglePinMessage({
        chatId: selectedChat.id,
        message: msg,
        isPinned,
        currentPinned: pinnedMessages,
        uid: currentUser.uid,
      })
      message.success(isPinned ? 'Message unpinned' : 'Message pinned')
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const scrollToMessage = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('bg-primary/15', 'rounded-lg')
      setTimeout(() => el.classList.remove('bg-primary/15', 'rounded-lg'), 1600)
    }
  }

  const {
    title: rawTitle,
    avatar: rawAvatar,
    username: rawUsername,
    isGroup,
  } = getChatDisplay(selectedChat, currentUser?.uid)
  const title = !isGroup && otherUserDoc?.displayName ? otherUserDoc.displayName : rawTitle
  const avatar = !isGroup && otherUserDoc !== null ? otherUserDoc.photoURL : rawAvatar
  const username = !isGroup && otherUserDoc?.username ? otherUserDoc.username : rawUsername
  const typers = getActiveTypers(selectedChat, currentUser?.uid)
  const isBlocked =
    !isGroup && otherUid && blocks.some((b) => b.uid === otherUid)
  const isContact =
    !isGroup && otherUid && contacts.some((c) => c.uid === otherUid)
  const canSeePresence =
    !isGroup &&
    !isBlocked &&
    (!otherUserDoc?.isPrivate || isContact)
  const online = isUserOnline(otherUserDoc, canSeePresence)
  const presenceLabel = formatPresenceLabel(otherUserDoc, canSeePresence)

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar: hidden on mobile when a chat is open */}
      <div
        className={
          selectedChatId
            ? 'hidden md:flex h-full shrink-0'
            : 'flex h-full w-full md:w-auto shrink-0'
        }
      >
        <ChatSidebar
          chats={chats}
          loading={chatsLoading}
          currentUid={currentUser?.uid}
          selectedChatId={selectedChatId}
          onSelectChat={selectChat}
          onOpenNewChat={() => setNewChatOpen(true)}
          onOpenNewGroup={() => setNewGroupOpen(true)}
        />
      </div>

      {/* Main Conversation Pane */}
      <section
        className={
          selectedChatId
            ? 'flex h-full min-w-0 flex-1 flex-col'
            : 'hidden md:flex h-full min-w-0 flex-1 flex-col'
        }
      >
        {!selectedChat ? (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-3xl text-primary">
                <MessageOutlined />
              </div>
              <h2 className="m-0 text-lg font-semibold">Select a conversation</h2>
              <p className="m-0 max-w-xs text-xs text-muted">
                Choose a chat from the sidebar, start a new 1:1 message, or create a group.
              </p>
              <div className="flex justify-center gap-2 pt-1">
                <Button onClick={() => setNewChatOpen(true)}>New Message</Button>
                <Button type="primary" onClick={() => setNewGroupOpen(true)}>
                  Create Group
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="text"
                  icon={<ArrowLeftOutlined />}
                  className="md:!hidden"
                  onClick={() => selectChat(null)}
                />

                <div
                  className="relative shrink-0 cursor-pointer"
                  onClick={() => setInfoOpen(true)}
                >
                  <Avatar
                    key={avatar || 'no-avatar'}
                    size={40}
                    src={avatar || undefined}
                    icon={isGroup && !avatar ? <TeamOutlined /> : undefined}
                    className="bg-primary font-semibold"
                  >
                    {!isGroup && getInitials(title)}
                  </Avatar>
                  {online && (
                    <span className="absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[var(--color-surface)] bg-emerald-500" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!isGroup && username ? (
                      <Link
                        to={`/u/${username}`}
                        className="truncate text-sm font-bold text-foreground no-underline hover:underline"
                      >
                        {title}
                      </Link>
                    ) : (
                      <span
                        onClick={() => setInfoOpen(true)}
                        className="cursor-pointer truncate text-sm font-bold"
                      >
                        {title}
                      </span>
                    )}
                  </div>

                  <div className="truncate text-xs text-muted">
                    {typers.length > 0 ? (
                      <span className="font-medium text-primary">
                        {isGroup ? `${typers.join(', ')} typing...` : 'typing...'}
                      </span>
                    ) : isGroup ? (
                      `${(selectedChat.memberIds || []).length} members`
                    ) : (
                      presenceLabel || (username ? `@${username}` : '')
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {pinnedMessages.length > 0 && (
                  <Popover
                    trigger="click"
                    placement="bottomRight"
                    title={`Pinned Messages (${pinnedMessages.length})`}
                    content={
                      <div className="max-h-60 w-64 space-y-2 overflow-y-auto">
                        {pinnedMessages.map((pm) => (
                          <div
                            key={pm.id}
                            onClick={() => scrollToMessage(pm.id)}
                            className="flex cursor-pointer items-center justify-between gap-2 rounded border border-[var(--color-border)] p-2 text-xs hover:bg-primary/10"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{pm.senderName}</div>
                              <div className="truncate text-muted">{pm.text}</div>
                            </div>
                            <Button
                              type="text"
                              size="small"
                              icon={<CloseOutlined />}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleTogglePin(pm, true)
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    }
                  >
                    <Button
                      type="text"
                      icon={<PushpinFilled className="text-primary" />}
                    >
                      <span className="text-xs">{pinnedMessages.length}</span>
                    </Button>
                  </Popover>
                )}

                <Tooltip title="Search in conversation">
                  <Button
                    type={searchOpen ? 'primary' : 'text'}
                    icon={<SearchOutlined />}
                    onClick={() => {
                      setSearchOpen((prev) => !prev)
                      setInChatQuery('')
                    }}
                  />
                </Tooltip>

                <Tooltip title="Conversation details">
                  <Button
                    type="text"
                    icon={<InfoCircleOutlined />}
                    onClick={() => setInfoOpen(true)}
                  />
                </Tooltip>
              </div>
            </header>

            {/* In-chat Search Bar */}
            {searchOpen && (
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
                <Input
                  allowClear
                  size="small"
                  prefix={<SearchOutlined className="text-muted" />}
                  placeholder="Search messages in this chat..."
                  value={inChatQuery}
                  onChange={(e) => setInChatQuery(e.target.value)}
                />
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setSearchOpen(false)
                    setInChatQuery('')
                  }}
                />
              </div>
            )}

            {/* Pinned Message Quick Banner */}
            {pinnedMessages.length > 0 && !searchOpen && (
              <div
                onClick={() => scrollToMessage(pinnedMessages[0].id)}
                className="flex cursor-pointer items-center justify-between gap-2 border-b border-[var(--color-border)] bg-primary/10 px-4 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <PushpinFilled className="text-primary shrink-0" />
                  <span className="font-semibold shrink-0">
                    Pinned ({pinnedMessages.length}):
                  </span>
                  <span className="truncate text-muted">
                    {pinnedMessages[0].text}
                  </span>
                </div>
              </div>
            )}

            {/* Messages Area with Fixed Viewport Background */}
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {selectedChat.backgroundURL && (
                <div
                  aria-hidden="true"
                  style={{
                    backgroundImage: `linear-gradient(to bottom, rgba(15, 16, 20, 0.45), rgba(15, 16, 20, 0.55)), url(${selectedChat.backgroundURL})`,
                  }}
                  className="pointer-events-none absolute inset-0 bg-cover bg-center bg-no-repeat"
                />
              )}

              <div
                ref={listRef}
                onScroll={(e) => {
                  if (e.currentTarget.scrollTop < 40 && hasMore && !loadingOlder) {
                    loadOlder()
                  }
                }}
                className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-1"
              >
              {hasMore && (
                <div className="py-2 text-center">
                  <Button
                    size="small"
                    loading={loadingOlder}
                    onClick={loadOlder}
                  >
                    Load earlier messages
                  </Button>
                </div>
              )}

              {messagesLoading ? (
                <div className="space-y-4 p-4">
                  <Skeleton avatar active paragraph={{ rows: 1 }} />
                  <Skeleton avatar active paragraph={{ rows: 1 }} />
                </div>
              ) : visibleMessages.length === 0 ? (
                <div className="grid h-full place-items-center py-12">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      inChatQuery.trim()
                        ? `No messages matching "${inChatQuery}"`
                        : 'Say hello to start the conversation!'
                    }
                  />
                </div>
              ) : (
                visibleMessages.map((msg, idx) => {
                  const prev = visibleMessages[idx - 1]
                  const currDate = toDate(msg.createdAt)?.toDateString()
                  const prevDate = toDate(prev?.createdAt)?.toDateString()
                  const showDivider = currDate && currDate !== prevDate

                  return (
                    <div key={msg.id}>
                      {showDivider && (
                        <div className="my-3 flex items-center justify-center">
                          <span className="rounded-full bg-[var(--color-surface-raised)] px-3 py-0.5 text-[11px] font-medium text-muted">
                            {formatDateDivider(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={msg}
                        chat={selectedChat}
                        currentUid={currentUser?.uid}
                        isGroup={isGroup}
                        isPinned={pinnedIds.has(msg.id)}
                        onReply={(m) => {
                          setEditingMessage(null)
                          setReplyTo(m)
                        }}
                        onEdit={(m) => {
                          setReplyTo(null)
                          setEditingMessage(m)
                        }}
                        onUnsend={handleUnsend}
                        onDeleteForMe={handleDeleteForMe}
                        onReaction={handleReaction}
                        onTogglePin={handleTogglePin}
                        onForward={(m) => setForwardTarget(m)}
                        onVotePoll={handleVotePoll}
                        onToggleClosePoll={handleToggleClosePoll}
                        onScrollToMessage={scrollToMessage}
                      />
                    </div>
                  )
                })
              )}

              {typers.length > 0 && (
                <div className="flex items-center gap-2 pl-2 pt-1 text-xs italic text-muted">
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.3s]" />
                  </span>
                  <span>{typers.join(', ')} typing...</span>
                </div>
              )}
              </div>
            </div>

            {/* Composer */}
            <MessageComposer
              chatId={selectedChat.id}
              currentUid={currentUser?.uid}
              isGroup={isGroup}
              replyTo={replyTo}
              editingMessage={editingMessage}
              onClearReply={() => setReplyTo(null)}
              onClearEdit={() => setEditingMessage(null)}
              onSend={handleSend}
              onSaveEdit={handleSaveEdit}
              onOpenPollModal={() => setPollModalOpen(true)}
              disabled={isBlocked}
            />
          </>
        )}
      </section>

      {/* Modals & Drawers */}
      {isGroup && (
        <CreatePollModal
          open={pollModalOpen}
          onClose={() => setPollModalOpen(false)}
          onCreatePoll={handleCreatePoll}
        />
      )}
      <NewChatModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        currentUser={currentUser}
        contacts={contacts}
        onSelectChat={selectChat}
      />

      <NewGroupModal
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        currentUser={currentUser}
        contacts={contacts}
        onCreated={selectChat}
      />

      <ForwardMessageModal
        open={!!forwardTarget}
        onClose={() => setForwardTarget(null)}
        messageToForward={forwardTarget}
        chats={chats}
        currentUser={currentUser}
      />

      <ChatInfoDrawer
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        chat={selectedChat}
        otherUserDoc={otherUserDoc}
        messages={messages}
        currentUser={currentUser}
        contacts={contacts}
        blocks={blocks}
      />
    </div>
  )
}
