import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchOlderMessages } from '@/features/chats/api/chatsApi'
import { toDate } from '@/lib/utils'

// Live window size for the real-time listener (keeps Firestore reads low on free tier)
export const LIVE_WINDOW_SIZE = 35
// Number of older messages fetched per back-read scroll page
export const HISTORY_PAGE_SIZE = 35

export function useChatMessages(chatId) {
  const [messagesMap, setMessagesMap] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const oldestSnapRef = useRef(null)

  useEffect(() => {
    if (!chatId) {
      setMessagesMap(new Map())
      setHasMore(false)
      oldestSnapRef.current = null
      return undefined
    }

    setLoading(true)
    setMessagesMap(new Map())
    oldestSnapRef.current = null

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(LIVE_WINDOW_SIZE),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
        if (!oldestSnapRef.current && docs.length > 0) {
          oldestSnapRef.current = docs[docs.length - 1]
          setHasMore(docs.length === LIVE_WINDOW_SIZE)
        }

        setMessagesMap((prev) => {
          const next = new Map(prev)
          // Apply changes (added, modified, removed) without losing older loaded messages
          snap.docChanges().forEach((change) => {
            if (change.type === 'removed') {
              next.delete(change.doc.id)
            } else {
              next.set(change.doc.id, { id: change.doc.id, ...change.doc.data() })
            }
          })
          return next
        })
        setLoading(false)
      },
      (err) => {
        console.error('messages listener', err)
        setLoading(false)
      },
    )

    return () => unsub()
  }, [chatId])

  const loadOlder = useCallback(async () => {
    if (!chatId || !oldestSnapRef.current || loadingOlder || !hasMore) return false
    setLoadingOlder(true)
    try {
      const res = await fetchOlderMessages(
        chatId,
        oldestSnapRef.current,
        HISTORY_PAGE_SIZE,
      )
      if (res.messages.length > 0) {
        setMessagesMap((prev) => {
          const next = new Map(prev)
          for (const msg of res.messages) {
            if (!next.has(msg.id)) {
              next.set(msg.id, msg)
            }
          }
          return next
        })
      }
      oldestSnapRef.current = res.lastSnap
      setHasMore(res.hasMore)
      return res.messages.length > 0
    } catch (err) {
      console.error('loadOlder error', err)
      return false
    } finally {
      setLoadingOlder(false)
    }
  }, [chatId, loadingOlder, hasMore])

  const messages = useMemo(() => {
    const arr = Array.from(messagesMap.values())
    return arr.sort((a, b) => {
      const tA = toDate(a.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
      const tB = toDate(b.createdAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
      return tA - tB
    })
  }, [messagesMap])

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
  }
}
