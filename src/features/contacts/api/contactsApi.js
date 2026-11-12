import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

const appError = (code) => Object.assign(new Error(code), { code })

export const getRequestId = (fromUid, toUid) => `${fromUid}_${toUid}`

export function toMiniProfile(profile) {
  return {
    uid: profile.uid,
    username: profile.username,
    displayName: profile.displayName || profile.username,
    photoURL: profile.photoURL || null,
  }
}

/**
 * Search users by username prefix (`usernameLower`).
 */
export async function searchUsersByPrefix(prefix, currentUid, maxResults = 20) {
  const clean = (prefix || '').trim().toLowerCase().replace(/^@/, '')
  if (!clean) return []

  const q = query(
    collection(db, 'users'),
    where('usernameLower', '>=', clean),
    where('usernameLower', '<=', `${clean}\uf8ff`),
    orderBy('usernameLower'),
    limit(maxResults),
  )

  const snap = await getDocs(q)
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((u) => u.uid !== currentUid)
}

/**
 * Check relationship state between currentUid and targetUid.
 */
export async function getRelationshipState(currentUid, targetUid) {
  if (!currentUid || !targetUid || currentUid === targetUid) {
    return {
      isSelf: true,
      isContact: false,
      iBlockedThem: false,
      theyBlockedMe: false,
      outgoingRequest: null,
      incomingRequest: null,
    }
  }

  const [contactSnap, myBlockSnap, theirBlockSnap, outReqSnap, inReqSnap] = await Promise.all([
    getDoc(doc(db, 'users', currentUid, 'contacts', targetUid)),
    getDoc(doc(db, 'users', currentUid, 'blocks', targetUid)),
    getDoc(doc(db, 'users', targetUid, 'blocks', currentUid)).catch(() => ({ exists: () => false })),
    getDoc(doc(db, 'contactRequests', getRequestId(currentUid, targetUid))),
    getDoc(doc(db, 'contactRequests', getRequestId(targetUid, currentUid))),
  ])

  const outData = outReqSnap.exists() ? { id: outReqSnap.id, ...outReqSnap.data() } : null
  const inData = inReqSnap.exists() ? { id: inReqSnap.id, ...inReqSnap.data() } : null

  return {
    isSelf: false,
    isContact: contactSnap.exists(),
    iBlockedThem: myBlockSnap.exists(),
    theyBlockedMe: theirBlockSnap.exists(),
    outgoingRequest: outData?.status === 'pending' ? outData : null,
    incomingRequest: inData?.status === 'pending' ? inData : null,
  }
}

export async function sendContactRequest(fromProfile, toProfile) {
  if (!fromProfile?.uid || !toProfile?.uid || fromProfile.uid === toProfile.uid) return

  const rel = await getRelationshipState(fromProfile.uid, toProfile.uid)
  if (rel.iBlockedThem || rel.theyBlockedMe) throw appError('app/blocked')
  if (rel.isContact) return

  // If they already sent us a pending request, accept it immediately!
  if (rel.incomingRequest) {
    await acceptContactRequest(rel.incomingRequest)
    return
  }

  const reqId = getRequestId(fromProfile.uid, toProfile.uid)
  await setDoc(doc(db, 'contactRequests', reqId), {
    fromUid: fromProfile.uid,
    toUid: toProfile.uid,
    fromUser: toMiniProfile(fromProfile),
    toUser: toMiniProfile(toProfile),
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function cancelContactRequest(fromUid, toUid) {
  await deleteDoc(doc(db, 'contactRequests', getRequestId(fromUid, toUid)))
}

export async function declineContactRequest(fromUid, toUid) {
  await deleteDoc(doc(db, 'contactRequests', getRequestId(fromUid, toUid)))
}

export async function acceptContactRequest(requestDoc) {
  const { fromUid, toUid, fromUser, toUser } = requestDoc
  const batch = writeBatch(db)

  batch.set(doc(db, 'users', fromUid, 'contacts', toUid), {
    ...toUser,
    createdAt: serverTimestamp(),
  })
  batch.set(doc(db, 'users', toUid, 'contacts', fromUid), {
    ...fromUser,
    createdAt: serverTimestamp(),
  })
  batch.delete(doc(db, 'contactRequests', getRequestId(fromUid, toUid)))
  // Also clean up reverse request if any existed
  batch.delete(doc(db, 'contactRequests', getRequestId(toUid, fromUid)))

  await batch.commit()
}

export async function removeContact(currentUid, targetUid) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'users', currentUid, 'contacts', targetUid))
  batch.delete(doc(db, 'users', targetUid, 'contacts', currentUid))
  await batch.commit()
}

export async function blockUser(currentProfile, targetProfile) {
  const currentUid = currentProfile.uid
  const targetUid = targetProfile.uid
  const batch = writeBatch(db)

  batch.set(doc(db, 'users', currentUid, 'blocks', targetUid), {
    ...toMiniProfile(targetProfile),
    createdAt: serverTimestamp(),
  })
  // Remove from contacts and delete any pending requests in either direction
  batch.delete(doc(db, 'users', currentUid, 'contacts', targetUid))
  batch.delete(doc(db, 'users', targetUid, 'contacts', currentUid))
  batch.delete(doc(db, 'contactRequests', getRequestId(currentUid, targetUid)))
  batch.delete(doc(db, 'contactRequests', getRequestId(targetUid, currentUid)))

  await batch.commit()
}

export async function unblockUser(currentUid, targetUid) {
  await deleteDoc(doc(db, 'users', currentUid, 'blocks', targetUid))
}

export async function reportUser({ reporterUid, targetUid, targetUsername, reason, details = '' }) {
  await addDoc(collection(db, 'reports'), {
    reporterUid,
    targetUid,
    targetUsername: targetUsername || '',
    reason,
    details: details.trim(),
    createdAt: serverTimestamp(),
  })
}

