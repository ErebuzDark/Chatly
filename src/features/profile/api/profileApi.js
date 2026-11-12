import { deleteUser, updateProfile } from 'firebase/auth'
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { reauthenticateUser } from '@/features/auth/api/authApi'

export async function getUserByUid(uid) {
  if (!uid) return null
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function getUserByUsername(username) {
  if (!username) return null
  const clean = username.trim().toLowerCase()
  const nameSnap = await getDoc(doc(db, 'usernames', clean))
  if (!nameSnap.exists()) return null
  const { uid } = nameSnap.data()
  return getUserByUid(uid)
}

export async function updateUserProfile(uid, updates) {
  const allowed = {}
  const fields = [
    'displayName',
    'bio',
    'photoURL',
    'coverURL',
    'birthday',
    'location',
    'links',
    'isPrivate',
    'visibility',
    'settings',
  ]
  for (const key of fields) {
    if (updates[key] !== undefined) allowed[key] = updates[key]
  }
  allowed.updatedAt = serverTimestamp()

  await updateDoc(doc(db, 'users', uid), allowed)

  if (auth.currentUser && auth.currentUser.uid === uid) {
    const authPatch = {}
    if (allowed.displayName !== undefined) authPatch.displayName = allowed.displayName
    if (allowed.photoURL !== undefined) authPatch.photoURL = allowed.photoURL
    if (Object.keys(authPatch).length > 0) {
      await updateProfile(auth.currentUser, authPatch).catch(() => {})
    }
  }

  // Propagate displayName / photoURL updates to active chats and contacts' lists
  if (allowed.displayName !== undefined || allowed.photoURL !== undefined) {
    try {
      const [chatsSnap, myContactsSnap] = await Promise.all([
        getDocs(query(collection(db, 'chats'), where('memberIds', 'array-contains', uid))),
        getDocs(collection(db, 'users', uid, 'contacts')),
      ])

      const batch = writeBatch(db)
      let ops = 0

      chatsSnap.docs.forEach((chatDoc) => {
        const patch = {}
        if (allowed.displayName !== undefined) {
          patch[`memberInfo.${uid}.displayName`] = allowed.displayName
        }
        if (allowed.photoURL !== undefined) {
          patch[`memberInfo.${uid}.photoURL`] = allowed.photoURL
        }
        batch.update(chatDoc.ref, patch)
        ops += 1
      })

      myContactsSnap.docs.forEach((contactDoc) => {
        const contactUid = contactDoc.id
        const mirrorRef = doc(db, 'users', contactUid, 'contacts', uid)
        const patch = {}
        if (allowed.displayName !== undefined) patch.displayName = allowed.displayName
        if (allowed.photoURL !== undefined) patch.photoURL = allowed.photoURL
        batch.update(mirrorRef, patch)
        ops += 1
      })

      if (ops > 0) {
        await batch.commit().catch(() => {})
      }
    } catch {
      // Non-fatal if background propagation partially fails
    }
  }
}

/* ---------------- Wall / Status Posts ---------------- */

export async function getWallPosts(uid, max = 25) {
  const q = query(
    collection(db, 'users', uid, 'posts'),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}

export async function createWallPost(uid, { text = '', mediaURL = null, mediaType = null }) {
  const cleanText = text.trim()
  if (!cleanText && !mediaURL) throw new Error('Post cannot be empty')
  const ref = await addDoc(collection(db, 'users', uid, 'posts'), {
    authorId: uid,
    text: cleanText,
    mediaURL,
    mediaType,
    likes: [],
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function deleteWallPost(uid, postId) {
  await deleteDoc(doc(db, 'users', uid, 'posts', postId))
}

export async function toggleLikeWallPost(profileUid, postId, likerUid, liked) {
  const ref = doc(db, 'users', profileUid, 'posts', postId)
  await updateDoc(ref, {
    likes: liked ? arrayRemove(likerUid) : arrayUnion(likerUid),
  })
}

/* ---------------- Account Deletion & Cleanup ---------------- */

export async function deleteAccountAndData(password) {
  const user = auth.currentUser
  if (!user) throw new Error('Not signed in')
  await reauthenticateUser(password)

  const uid = user.uid
  const userSnap = await getDoc(doc(db, 'users', uid))
  const usernameLower = userSnap.data()?.usernameLower

  const batch = writeBatch(db)

  // Delete subcollections (posts, contacts, blocks)
  const subcollections = ['posts', 'contacts', 'blocks']
  for (const sub of subcollections) {
    const snap = await getDocs(collection(db, 'users', uid, sub))
    snap.docs.forEach((d) => batch.delete(d.ref))
  }

  // Delete outgoing/incoming contact requests
  const [sentReqs, recvReqs] = await Promise.all([
    getDocs(query(collection(db, 'contactRequests'), where('fromUid', '==', uid))),
    getDocs(query(collection(db, 'contactRequests'), where('toUid', '==', uid))),
  ])
  sentReqs.docs.forEach((d) => batch.delete(d.ref))
  recvReqs.docs.forEach((d) => batch.delete(d.ref))

  if (usernameLower) {
    batch.delete(doc(db, 'usernames', usernameLower))
  }
  batch.delete(doc(db, 'users', uid))

  await batch.commit()
  await deleteUser(user)
}

