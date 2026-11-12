import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth'
import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { DEFAULT_SETTINGS, DEFAULT_VISIBILITY } from '@/lib/utils'

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/

const appError = (code) => Object.assign(new Error(code), { code })

export async function isUsernameAvailable(username) {
  const snap = await getDoc(doc(db, 'usernames', username.toLowerCase()))
  return !snap.exists()
}

/**
 * 1. cheap availability check  2. create auth user
 * 3. transaction: reserve username + create profile  4. verification email
 * If step 3 fails the auth user is removed so nothing is left half-created.
 */
export async function signUp({ email, password, username, displayName }) {
  const usernameLower = username.trim().toLowerCase()
  const name = displayName.trim()
  const cleanEmail = email.trim()

  if (!(await isUsernameAvailable(usernameLower))) throw appError('app/username-taken')

  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password)
  const uid = cred.user.uid

  try {
    await runTransaction(db, async (tx) => {
      const nameRef = doc(db, 'usernames', usernameLower)
      if ((await tx.get(nameRef)).exists()) throw appError('app/username-taken')
      tx.set(nameRef, { uid, createdAt: serverTimestamp() })
      tx.set(doc(db, 'users', uid), {
        uid,
        username: usernameLower,
        usernameLower,
        displayName: name,
        email: cleanEmail,
        photoURL: null,
        coverURL: null,
        bio: '',
        birthday: '',
        location: '',
        links: [],
        isPrivate: false,
        visibility: DEFAULT_VISIBILITY,
        settings: DEFAULT_SETTINGS,
        isOnline: true,
        lastSeenAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
  } catch (err) {
    await deleteUser(cred.user).catch(() => {})
    throw err
  }

  await updateProfile(cred.user, { displayName: name }).catch(() => {})
  await sendEmailVerification(cred.user).catch(() => {})
  return cred.user
}

export const signIn = ({ email, password }) =>
  signInWithEmailAndPassword(auth, email.trim(), password)

export const signOut = async () => {
  const uid = auth.currentUser?.uid
  if (uid) {
    await updateDoc(doc(db, 'users', uid), {
      isOnline: false,
      lastSeenAt: serverTimestamp(),
    }).catch(() => {})
  }
  return fbSignOut(auth)
}

export const resetPassword = (email) => sendPasswordResetEmail(auth, email.trim())

export const resendVerification = () => sendEmailVerification(auth.currentUser)

export async function reauthenticateUser(password) {
  const user = auth.currentUser
  if (!user || !user.email) throw new Error('Not signed in')
  const cred = EmailAuthProvider.credential(user.email, password)
  await reauthenticateWithCredential(user, cred)
}
