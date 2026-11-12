import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  PhoneOutlined,
  PushpinFilled,
  SearchOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { db } from '@/lib/firebase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import { useChats } from '@/features/chats/hooks/useChats'
import { useChatMessages } from '@/features/chats/hooks/useChatMessages'
import {
  deleteMessageForMe,
  editMessage,
  joinChatCall,
  markChatRead,
  sendMessage,
  sendPollMessage,
  startChatCall,
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
  const {
    chats,
    loading: chatsLoading,
    setActiveChatId,
    openCallChatId,
    setOpenCallChatId,
  } = useChats()
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
  const lastMsgIdRef = useRef(null)
  const initialChatScrollRef = useRef(null)
  const prependAnchorRef = useRef(null)

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

  // Mark chat read when viewing messages (updates unread count + lastReadAt + lastReadMessageId)
  const unreadInSelected = selectedChat?.unreadCounts?.[currentUser?.uid] || 0
  const latestMsgId = messages[messages.length - 1]?.id || null
  const myLastReadMsgId = selectedChat?.lastReadMessageId?.[currentUser?.uid] || null

  useEffect(() => {
    if (!selectedChatId || !currentUser?.uid) return
    if (unreadInSelected > 0 || (latestMsgId && latestMsgId !== myLastReadMsgId)) {
      markChatRead(selectedChatId, currentUser.uid, latestMsgId)
    }
  }, [selectedChatId, currentUser?.uid, unreadInSelected, latestMsgId, myLastReadMsgId])

  const handleLoadOlder = useCallback(async () => {
    const el = listRef.current
    if (!el || loadingOlder || !hasMore) return
    prependAnchorRef.current = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    }
    await loadOlder()
  }, [loadOlder, loadingOlder, hasMore])

  // Preserve exact scroll position when older messages are prepended (back-reading),
  // and scroll to bottom on initial chat load or when a new message arrives at the bottom.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return

    // 1. If we just prepended older messages via back-reading, keep scroll anchored
    if (prependAnchorRef.current) {
      const { scrollHeight: prevHeight, scrollTop: prevTop } = prependAnchorRef.current
      el.scrollTop = el.scrollHeight - prevHeight + prevTop
      prependAnchorRef.current = null
      return
    }

    const lastMsg = messages[messages.length - 1]
    const lastId = lastMsg?.id || null

    // 2. First load of the selected chat -> jump to bottom
    if (messages.length > 0 && initialChatScrollRef.current !== selectedChatId) {
      el.scrollTop = el.scrollHeight
      initialChatScrollRef.current = selectedChatId
      lastMsgIdRef.current = lastId
      return
    }

    // 3. New message appended at the bottom -> scroll down if sent by me or already near bottom
    if (lastId && lastId !== lastMsgIdRef.current) {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      const isMine = lastMsg?.senderId === currentUser?.uid
      if (isMine || distFromBottom < 220) {
        el.scrollTop = el.scrollHeight
      }
      lastMsgIdRef.current = lastId
    }
  }, [messages, selectedChatId, currentUser?.uid])

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

  // Compute Messenger-style Read Receipt Chat Heads:
  // For each other participant in the chat, find the latest visible message they have seen.
  const seenByByMessageId = useMemo(() => {
    const map = new Map()
    if (!selectedChat || !currentUser?.uid || visibleMessages.length === 0) return map

    const otherUids = (selectedChat.memberIds || []).filter((id) => id !== currentUser.uid)

    for (const mUid of otherUids) {
      const readAtMs = toDate(selectedChat.lastReadAt?.[mUid])?.getTime() || 0
      const readMsgId = selectedChat.lastReadMessageId?.[mUid] || null
      const memberProfile = selectedChat.memberInfo?.[mUid] || {
        uid: mUid,
        displayName: 'User',
        photoURL: null,
      }

      // Scan from newest message to oldest to find where this member stopped reading
      let stoppedAtMsgId = null
      for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
        const msg = visibleMessages[i]
        if (msg.type === 'system') continue

        const msgMs = toDate(msg.createdAt)?.getTime() || 0
        const hasSeenThis =
          (readMsgId && msg.id === readMsgId) ||
          msg.senderId === mUid ||
          (readAtMs > 0 && msgMs > 0 && msgMs <= readAtMs)

        if (hasSeenThis) {
          stoppedAtMsgId = msg.id
          break
        }
      }

      if (stoppedAtMsgId) {
        const list = map.get(stoppedAtMsgId) || []
        list.push({
          uid: mUid,
          displayName: memberProfile.displayName || memberProfile.username || 'User',
          photoURL: memberProfile.photoURL || undefined,
          seenAt: selectedChat.lastReadAt?.[mUid] || null,
        })
        map.set(stoppedAtMsgId, list)
      }
    }

    return map
  }, [selectedChat, currentUser?.uid, visibleMessages])

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

  const handleStartOrJoinCall = async (callType = 'video') => {
    if (!selectedChat || !currentUser?.uid) return
    if (isBlocked) {
      message.warning('Cannot call a blocked user.')
      return
    }
    try {
      if (selectedChat.activeCall) {
        await joinChatCall(selectedChat.id, currentUser.uid)
        setOpenCallChatId(selectedChat.id)
      } else {
        await startChatCall({
          chat: selectedChat,
          callerProfile: currentUser,
          callType,
        })
        setOpenCallChatId(selectedChat.id)
      }
    } catch (err) {
      message.error(getErrorMessage(err))
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
            <header className="flex items-center justify-between gap-2 sm:gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-2 sm:px-4 sm:py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <Button
                  type="text"
                  icon={<ArrowLeftOutlined />}
                  className="md:!hidden !px-1.5 shrink-0"
                  onClick={() => selectChat(null)}
                />

                <div
                  className="relative shrink-0 cursor-pointer"
                  onClick={() => setInfoOpen(true)}
                >
                  <Avatar
                    key={avatar || 'no-avatar'}
                    size={36}
                    src={avatar || undefined}
                    icon={isGroup && !avatar ? <TeamOutlined /> : undefined}
                    className="bg-primary font-semibold sm:!h-10 sm:!w-10"
                  >
                    {!isGroup && getInitials(title)}
                  </Avatar>
                  {online && (
                    <span className="absolute right-0 bottom-0 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-[var(--color-surface)] bg-emerald-500" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2">
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

                  <div className="truncate text-[11px] sm:text-xs text-muted">
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

              <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                {!isBlocked && (
                  <>
                    <Tooltip title="Voice call">
                      <Button
                        type="text"
                        icon={<PhoneOutlined />}
                        className="!px-2 sm:!px-2.5"
                        onClick={() => handleStartOrJoinCall('audio')}
                      />
                    </Tooltip>
                    <Tooltip title="Video call">
                      <Button
                        type="text"
                        icon={<VideoCameraOutlined />}
                        className="!px-2 sm:!px-2.5"
                        onClick={() => handleStartOrJoinCall('video')}
                      />
                    </Tooltip>
                  </>
                )}

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
                      className="!px-1.5 sm:!px-2.5"
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
                    className="!px-2 sm:!px-2.5"
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
                    className="!px-2 sm:!px-2.5"
                    onClick={() => setInfoOpen(true)}
                  />
                </Tooltip>
              </div>
            </header>

            {/* Active Call Banner (when a call is ongoing in this chat and not currently open) */}
            {selectedChat.activeCall && openCallChatId !== selectedChat.id && (
              <div className="flex items-center justify-between gap-3 border-b border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-xs">
                <div className="flex items-center gap-2 font-medium text-emerald-400">
                  <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
                  <span>
                    {selectedChat.activeCall.callType === 'audio'
                      ? 'Voice call'
                      : 'Video call'}{' '}
                    in progress ({(selectedChat.activeCall.participants || []).length}{' '}
                    joined)
                  </span>
                </div>
                <Button
                  size="small"
                  type="primary"
                  style={{ backgroundColor: '#10b981' }}
                  icon={
                    selectedChat.activeCall.callType === 'audio' ? (
                      <PhoneOutlined />
                    ) : (
                      <VideoCameraOutlined />
                    )
                  }
                  onClick={() => handleStartOrJoinCall(selectedChat.activeCall.callType)}
                >
                  Join Call
                </Button>
              </div>
            )}

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
                  if (e.currentTarget.scrollTop < 60 && hasMore && !loadingOlder) {
                    handleLoadOlder()
                  }
                }}
                className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2.5 sm:px-4 sm:py-3 space-y-1"
              >
              {hasMore && (
                <div className="py-2 text-center">
                  <Button
                    size="small"
                    loading={loadingOlder}
                    onClick={handleLoadOlder}
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
                        seenByUsers={seenByByMessageId.get(msg.id)}
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
