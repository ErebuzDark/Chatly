import { useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/features/auth/hooks/useAuth'

export function useContacts() {
  const { user } = useAuth()
  const uid = user?.uid

  const [rawContacts, setRawContacts] = useState([])
  const [contactUsersMap, setContactUsersMap] = useState({})
  const [blocks, setBlocks] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const userSubsRef = useRef(new Map())

  useEffect(() => {
    if (!uid) {
      setRawContacts([])
      setContactUsersMap({})
      setBlocks([])
      setIncomingRequests([])
      setOutgoingRequests([])
      setLoading(false)
      userSubsRef.current.forEach((u) => u())
      userSubsRef.current.clear()
      return undefined
    }

    setLoading(true)

    const unsubContacts = onSnapshot(
      query(collection(db, 'users', uid, 'contacts'), orderBy('createdAt', 'desc')),
      (snap) => {
        setRawContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        console.error('contacts listener', err)
        setLoading(false)
      },
    )

    const unsubBlocks = onSnapshot(
      query(collection(db, 'users', uid, 'blocks'), orderBy('createdAt', 'desc')),
      (snap) => setBlocks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('blocks listener', err),
    )

    const unsubIncoming = onSnapshot(
      query(
        collection(db, 'contactRequests'),
        where('toUid', '==', uid),
        where('status', '==', 'pending'),
      ),
      (snap) => setIncomingRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('incoming requests listener', err),
    )

    const unsubOutgoing = onSnapshot(
      query(
        collection(db, 'contactRequests'),
        where('fromUid', '==', uid),
        where('status', '==', 'pending'),
      ),
      (snap) => setOutgoingRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error('outgoing requests listener', err),
    )

    return () => {
      unsubContacts()
      unsubBlocks()
      unsubIncoming()
      unsubOutgoing()
    }
  }, [uid])

  // Subscribe to live profile docs for each contact so avatars/names are always current
  useEffect(() => {
    const needed = new Set(rawContacts.map((c) => c.uid).filter(Boolean))

    for (const cUid of needed) {
      if (!userSubsRef.current.has(cUid)) {
        const unsub = onSnapshot(
          doc(db, 'users', cUid),
          (snap) => {
            if (snap.exists()) {
              setContactUsersMap((prev) => ({
                ...prev,
                [cUid]: { id: snap.id, ...snap.data() },
              }))
            }
          },
          () => {},
        )
        userSubsRef.current.set(cUid, unsub)
      }
    }

    for (const [cUid, unsub] of userSubsRef.current.entries()) {
      if (!needed.has(cUid)) {
        unsub()
        userSubsRef.current.delete(cUid)
      }
    }
  }, [rawContacts])

  useEffect(() => {
    const subs = userSubsRef.current
    return () => {
      subs.forEach((u) => u())
      subs.clear()
    }
  }, [])

  const contacts = useMemo(() => {
    return rawContacts.map((c) => {
      const live = contactUsersMap[c.uid]
      if (!live) return c
      return {
        ...c,
        displayName: live.displayName || c.displayName,
        username: live.username || c.username,
        photoURL: live.photoURL || c.photoURL || null,
      }
    })
  }, [rawContacts, contactUsersMap])

  return {
    contacts,
    blocks,
    incomingRequests,
    outgoingRequests,
    loading,
  }
}
