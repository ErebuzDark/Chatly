import { useCallback, useEffect, useRef, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { fetchOlderMessages } from '@/features/chats/api/chatsApi'

const PAGE_SIZE = 30

export function useChatMessages(chatId) {
  const [liveMessages, setLiveMessages] = useState([])
  const [olderMessages, setOlderMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  const oldestSnapRef = useRef(null)

  useEffect(() => {
    if (!chatId) {
      setLiveMessages([])
      setOlderMessages([])
      setHasMore(false)
      oldestSnapRef.current = null
      return undefined
    }

    setLoading(true)
    setOlderMessages([])
    oldestSnapRef.current = null

    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    )

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
        const list = docs.map((d) => ({ id: d.id, ...d.data() })).reverse()
        setLiveMessages(list)
        if (!oldestSnapRef.current && docs.length > 0) {
          oldestSnapRef.current = docs[docs.length - 1]
          setHasMore(docs.length === PAGE_SIZE)
        }
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
    if (!chatId || !oldestSnapRef.current || loadingOlder || !hasMore) return
    setLoadingOlder(true)
    try {
      const res = await fetchOlderMessages(chatId, oldestSnapRef.current, PAGE_SIZE)
      if (res.messages.length > 0) {
        setOlderMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const uniqueOlder = res.messages.filter((m) => !existingIds.has(m.id))
          return [...uniqueOlder, ...prev]
        })
      }
      oldestSnapRef.current = res.lastSnap
      setHasMore(res.hasMore)
    } catch (err) {
      console.error('loadOlder error', err)
    } finally {
      setLoadingOlder(false)
    }
  }, [chatId, loadingOlder, hasMore])

  // Combine older paginated messages + live recent messages (deduplicated)
  const messages = (() => {
    const liveIds = new Set(liveMessages.map((m) => m.id))
    const filteredOlder = olderMessages.filter((m) => !liveIds.has(m.id))
    return [...filteredOlder, ...liveMessages]
  })()

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    loadOlder,
  }
}

