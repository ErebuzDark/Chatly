import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { App } from 'antd'
import { db } from '@/lib/firebase'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { markChatDelivered } from '@/features/chats/api/chatsApi'
import { playNotificationSound } from '@/services/sound'
import { APP_NAME, DEFAULT_SETTINGS } from '@/lib/utils'

const ChatsContext = createContext(null)

export function ChatsProvider({ children }) {
  const { user, profile } = useAuth()
  const { notification } = App.useApp()
  const uid = user?.uid

  const [rawChats, setRawChats] = useState([])
  const [usersMap, setUsersMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeChatId, setActiveChatId] = useState(null)
  const [openCallChatId, setOpenCallChatId] = useState(null)

  const prevLastMsgIdsRef = useRef(new Map())
  const initialLoadRef = useRef(true)
  const userUnsubsRef = useRef(new Map())

  useEffect(() => {
    if (!uid) {
      setRawChats([])
      setUsersMap({})
      setLoading(false)
      prevLastMsgIdsRef.current.clear()
      initialLoadRef.current = true
      userUnsubsRef.current.forEach((unsub) => unsub())
      userUnsubsRef.current.clear()
      return undefined
    }

    setLoading(true)

    const q = query(
      collection(db, 'chats'),
      where('memberIds', 'array-contains', uid),
      orderBy('lastMessageAt', 'desc'),
      limit(60),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setRawChats(list)
        setLoading(false)

        const settings = { ...DEFAULT_SETTINGS, ...profile?.settings }

        for (const chat of list) {
          const lastMsg = chat.lastMessage
          const prevMsgId = prevLastMsgIdsRef.current.get(chat.id)
          const currMsgId = lastMsg?.id || lastMsg?.createdAt || null

          prevLastMsgIdsRef.current.set(chat.id, currMsgId)

          if (
            !initialLoadRef.current &&
            currMsgId &&
            currMsgId !== prevMsgId &&
            lastMsg?.senderId &&
            lastMsg.senderId !== uid
          ) {
            // Mark as delivered
            markChatDelivered(chat.id, uid)

            const isMuted = Array.isArray(chat.mutedBy) && chat.mutedBy.includes(uid)
            const isViewingThisChat =
              activeChatId === chat.id && document.visibilityState === 'visible'

            if (!isMuted && !isViewingThisChat) {
              if (settings.soundEnabled !== false) {
                playNotificationSound()
              }

              const chatTitle =
                chat.type === 'group'
                  ? chat.title || 'Group chat'
                  : lastMsg.senderName || 'New message'

              if (settings.inAppNotifications !== false) {
                notification.info({
                  message: chatTitle,
                  description:
                    chat.type === 'group'
                      ? `${lastMsg.senderName}: ${lastMsg.text}`
                      : lastMsg.text,
                  placement: 'topRight',
                  duration: 3.5,
                })
              }

              if (
                settings.desktopNotifications &&
                typeof Notification !== 'undefined' &&
                Notification.permission === 'granted' &&
                document.visibilityState !== 'visible'
              ) {
                try {
                  new Notification(chatTitle, { body: lastMsg.text })
                } catch {
                  // ignore
                }
              }
            }
          }
        }

        initialLoadRef.current = false
      },
      (err) => {
        console.error('chats listener', err)
        setLoading(false)
      },
    )

    return () => unsub()
  }, [uid, activeChatId, profile?.settings, notification])

  // Subscribe to live user profile docs for all unique chat members so avatars/names are always up to date
  useEffect(() => {
    const neededUids = new Set()
    for (const chat of rawChats) {
      for (const mUid of chat.memberIds || []) {
        if (mUid) neededUids.add(mUid)
      }
    }

    // Attach listeners for newly discovered member UIDs
    for (const mUid of neededUids) {
      if (!userUnsubsRef.current.has(mUid)) {
        const unsub = onSnapshot(
          doc(db, 'users', mUid),
          (snap) => {
            if (snap.exists()) {
              const data = { id: snap.id, ...snap.data() }
              setUsersMap((prev) => ({ ...prev, [mUid]: data }))
            }
          },
          () => {},
        )
        userUnsubsRef.current.set(mUid, unsub)
      }
    }

    // Clean up listeners for UIDs no longer in any chat
    for (const [mUid, unsub] of userUnsubsRef.current.entries()) {
      if (!neededUids.has(mUid)) {
        unsub()
        userUnsubsRef.current.delete(mUid)
      }
    }
  }, [rawChats])

  // Cleanup all user listeners on unmount
  useEffect(() => {
    const subs = userUnsubsRef.current
    return () => {
      subs.forEach((unsub) => unsub())
      subs.clear()
    }
  }, [])

  // Enrich every chat's memberInfo with live user profile data (photoURL, displayName, username, presence)
  const chats = useMemo(() => {
    return rawChats.map((chat) => {
      const nextMemberInfo = { ...(chat.memberInfo || {}) }
      for (const mUid of chat.memberIds || []) {
        const liveUser = usersMap[mUid]
        if (liveUser) {
          const prevInfo = nextMemberInfo[mUid] || {}
          nextMemberInfo[mUid] = {
            ...prevInfo,
            uid: mUid,
            username: liveUser.username || prevInfo.username || '',
            displayName: liveUser.displayName || prevInfo.displayName || 'User',
            photoURL: liveUser.photoURL || prevInfo.photoURL || null,
            isOnline: liveUser.isOnline,
            lastSeenAt: liveUser.lastSeenAt,
            visibility: liveUser.visibility,
            isPrivate: liveUser.isPrivate,
          }
        }
      }
      return {
        ...chat,
        memberInfo: nextMemberInfo,
      }
    })
  }, [rawChats, usersMap])

  const totalUnread = useMemo(() => {
    if (!uid) return 0
    return chats.reduce((sum, c) => {
      const isArchived = Array.isArray(c.archivedBy) && c.archivedBy.includes(uid)
      if (isArchived) return sum
      const count = c.unreadCounts?.[uid] || 0
      return sum + (count > 0 ? count : 0)
    }, 0)
  }, [chats, uid])

  // Update browser tab title with unread count
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) ${APP_NAME}` : APP_NAME
  }, [totalUnread])

  const value = useMemo(
    () => ({
      chats,
      usersMap,
      loading,
      totalUnread,
      activeChatId,
      setActiveChatId,
      openCallChatId,
      setOpenCallChatId,
    }),
    [chats, usersMap, loading, totalUnread, activeChatId, openCallChatId],
  )

  return createElement(ChatsContext.Provider, { value }, children)
}

export function useChats() {
  const ctx = useContext(ChatsContext)
  if (!ctx) throw new Error('useChats must be used inside <ChatsProvider>')
  return ctx
}
