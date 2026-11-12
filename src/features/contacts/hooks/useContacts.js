import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/features/auth/hooks/useAuth'

export function useContacts() {
  const { user } = useAuth()
  const uid = user?.uid

  const [contacts, setContacts] = useState([])
  const [blocks, setBlocks] = useState([])
  const [incomingRequests, setIncomingRequests] = useState([])
  const [outgoingRequests, setOutgoingRequests] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setContacts([])
      setBlocks([])
      setIncomingRequests([])
      setOutgoingRequests([])
      setLoading(false)
      return undefined
    }

    setLoading(true)

    const unsubContacts = onSnapshot(
      query(collection(db, 'users', uid, 'contacts'), orderBy('createdAt', 'desc')),
      (snap) => {
        setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
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

  return {
    contacts,
    blocks,
    incomingRequests,
    outgoingRequests,
    loading,
  }
}

