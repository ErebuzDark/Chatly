import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { usePresence } from '@/hooks/usePresence'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [emailVerified, setEmailVerified] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        setEmailVerified(!!u?.emailVerified)
        if (!u) setProfile(null)
        setAuthReady(true)
      }),
    [],
  )

  // Live profile doc (appears a moment after signup completes).
  useEffect(() => {
    if (!user?.uid) return undefined
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => setProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null),
      (err) => console.error('profile listener', err),
    )
  }, [user?.uid])

  // Throttled online/last-seen presence
  usePresence(user?.uid)

  const reloadUser = useCallback(async () => {
    if (!auth.currentUser) return
    await auth.currentUser.reload()
    setEmailVerified(auth.currentUser.emailVerified)
  }, [])

  const value = useMemo(
    () => ({ user, profile, emailVerified, authReady, reloadUser }),
    [user, profile, emailVerified, authReady, reloadUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
