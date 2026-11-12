import { useEffect, useRef } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const HEARTBEAT_MS = 4 * 60 * 1000 // 4 minutes (free-tier friendly)
const MIN_WRITE_GAP_MS = 45 * 1000 // Throttle rapid tab switches

export function usePresence(uid) {
  const lastWriteRef = useRef(0)

  useEffect(() => {
    if (!uid) return undefined

    const userRef = doc(db, 'users', uid)

    const setStatus = (online, force = false) => {
      const now = Date.now()
      if (!force && now - lastWriteRef.current < MIN_WRITE_GAP_MS) return
      lastWriteRef.current = now
      updateDoc(userRef, {
        isOnline: online,
        lastSeenAt: serverTimestamp(),
      }).catch(() => {})
    }

    setStatus(true, true)

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setStatus(true, true)
      }
    }, HEARTBEAT_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setStatus(true)
      } else {
        setStatus(false)
      }
    }

    const onBeforeUnload = () => {
      setStatus(false, true)
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [uid])
}

