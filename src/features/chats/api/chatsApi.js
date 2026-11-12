import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { toMiniProfile } from '@/features/contacts/api/contactsApi'

const appError = (code) => Object.assign(new Error(code), { code })

export function getDirectChatId(uid1, uid2) {
  return `dm_${[uid1, uid2].sort().join('_')}`
}

function randomInviteCode(len = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < len; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

/**
 * Get or create a 1:1 direct chat between two users.
 */
export async function getOrCreateDirectChat(currentUser, targetUser) {
  if (!currentUser?.uid || !targetUser?.uid) throw new Error('Invalid users')
  const chatId = getDirectChatId(currentUser.uid, targetUser.uid)
  const chatRef = doc(db, 'chats', chatId)
  const snap = await getDoc(chatRef)

  if (snap.exists()) {
    // Refresh memberInfo in case displayName/photoURL changed
    await updateDoc(chatRef, {
      [`memberInfo.${currentUser.uid}`]: toMiniProfile(currentUser),
      [`memberInfo.${targetUser.uid}`]: toMiniProfile(targetUser),
    }).catch(() => {})
    return { id: snap.id, ...snap.data() }
  }

  const memberIds = [currentUser.uid, targetUser.uid].sort()
  const payload = {
    type: 'direct',
    memberIds,
    memberInfo: {
      [currentUser.uid]: toMiniProfile(currentUser),
      [targetUser.uid]: toMiniProfile(targetUser),
    },
    lastMessage: null,
    lastMessageAt: serverTimestamp(),
    unreadCounts: {
      [currentUser.uid]: 0,
      [targetUser.uid]: 0,
    },
    lastReadAt: {
      [currentUser.uid]: serverTimestamp(),
    },
    lastDeliveredAt: {
      [currentUser.uid]: serverTimestamp(),
    },
    typing: {},
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
    pinnedMessages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }

  await setDoc(chatRef, payload)
  return { id: chatId, ...payload }
}

/**
 * Create a new group chat.
 */
export async function createGroupChat({
  creatorProfile,
  title,
  description = '',
  avatarURL = null,
  memberProfiles = [],
}) {
  const cleanTitle = (title || '').trim()
  if (!cleanTitle) throw new Error('Group title is required')

  const allProfiles = [creatorProfile, ...memberProfiles.filter((m) => m.uid !== creatorProfile.uid)]
  const memberIds = Array.from(new Set(allProfiles.map((p) => p.uid)))
  const memberInfo = {}
  const roles = {}
  const unreadCounts = {}

  for (const p of allProfiles) {
    memberInfo[p.uid] = toMiniProfile(p)
    roles[p.uid] = p.uid === creatorProfile.uid ? 'admin' : 'member'
    unreadCounts[p.uid] = 0
  }

  const inviteCode = randomInviteCode(10)

  const ref = await addDoc(collection(db, 'chats'), {
    type: 'group',
    title: cleanTitle,
    description: description.trim(),
    avatarURL,
    createdBy: creatorProfile.uid,
    memberIds,
    memberInfo,
    roles,
    inviteCode,
    inviteEnabled: true,
    lastMessage: {
      text: `${creatorProfile.displayName} created the group "${cleanTitle}"`,
      senderId: creatorProfile.uid,
      senderName: creatorProfile.displayName,
      type: 'system',
    },
    lastMessageAt: serverTimestamp(),
    unreadCounts,
    lastReadAt: { [creatorProfile.uid]: serverTimestamp() },
    lastDeliveredAt: { [creatorProfile.uid]: serverTimestamp() },
    typing: {},
    pinnedBy: [],
    mutedBy: [],
    archivedBy: [],
    pinnedMessages: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // System message in subcollection
  await addDoc(collection(db, 'chats', ref.id, 'messages'), {
    chatId: ref.id,
    senderId: creatorProfile.uid,
    senderName: creatorProfile.displayName,
    senderPhoto: creatorProfile.photoURL || null,
    type: 'system',
    text: `${creatorProfile.displayName} created the group "${cleanTitle}"`,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: {},
    deletedForAll: false,
    deletedFor: [],
    editedAt: null,
    createdAt: serverTimestamp(),
  })

  return ref.id
}

/**
 * Send a message (text, image, file, voice, or system).
 */
export async function sendMessage({
  chatId,
  senderProfile,
  text = '',
  type = 'text',
  attachments = [],
  replyTo = null,
  forwardedFrom = null,
  memberIds = [],
}) {
  const cleanText = text.trim()
  if (!cleanText && attachments.length === 0) return null

  const msgPayload = {
    chatId,
    senderId: senderProfile.uid,
    senderName: senderProfile.displayName || senderProfile.username,
    senderPhoto: senderProfile.photoURL || null,
    type,
    text: cleanText,
    attachments,
    replyTo: replyTo
      ? {
          id: replyTo.id,
          text: replyTo.text || '',
          senderId: replyTo.senderId,
          senderName: replyTo.senderName || 'User',
          type: replyTo.type || 'text',
        }
      : null,
    forwardedFrom: forwardedFrom
      ? {
          senderName: forwardedFrom.senderName || 'User',
        }
      : null,
    reactions: {},
    deletedForAll: false,
    deletedFor: [],
    editedAt: null,
    createdAt: serverTimestamp(),
  }

  const msgRef = await addDoc(collection(db, 'chats', chatId, 'messages'), msgPayload)

  let previewText = cleanText
  if (!previewText) {
    if (type === 'image') previewText = '📷 Photo'
    else if (type === 'voice') previewText = '🎤 Voice message'
    else if (type === 'file') previewText = `📎 ${attachments[0]?.name || 'File'}`
  }

  const chatUpdates = {
    lastMessage: {
      id: msgRef.id,
      text: previewText,
      senderId: senderProfile.uid,
      senderName: senderProfile.displayName || senderProfile.username,
      type,
      createdAt: new Date().toISOString(),
    },
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    [`typing.${senderProfile.uid}`]: deleteField(),
    [`lastReadAt.${senderProfile.uid}`]: serverTimestamp(),
    [`lastDeliveredAt.${senderProfile.uid}`]: serverTimestamp(),
    [`unreadCounts.${senderProfile.uid}`]: 0,
  }

  for (const uid of memberIds) {
    if (uid !== senderProfile.uid) {
      chatUpdates[`unreadCounts.${uid}`] = increment(1)
    }
  }

  await updateDoc(doc(db, 'chats', chatId), chatUpdates)
  return msgRef.id
}

export async function sendPollMessage({
  chatId,
  senderProfile,
  question,
  options = [],
  allowMultiple = true,
  memberIds = [],
}) {
  const cleanQuestion = (question || '').trim()
  const cleanOptions = options.map((o) => (o || '').trim()).filter(Boolean)
  if (!cleanQuestion || cleanOptions.length < 2) {
    throw new Error('Poll requires a question and at least 2 options')
  }

  const pollOptions = cleanOptions.map((text, idx) => ({
    id: `opt_${idx}`,
    text,
  }))

  const votes = {}
  for (const opt of pollOptions) {
    votes[opt.id] = []
  }

  const previewText = `📊 Poll: ${cleanQuestion}`

  const msgPayload = {
    chatId,
    senderId: senderProfile.uid,
    senderName: senderProfile.displayName || senderProfile.username,
    senderPhoto: senderProfile.photoURL || null,
    type: 'poll',
    text: previewText,
    poll: {
      question: cleanQuestion,
      allowMultiple: !!allowMultiple,
      closed: false,
      options: pollOptions,
      votes,
    },
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: {},
    deletedForAll: false,
    deletedFor: [],
    editedAt: null,
    createdAt: serverTimestamp(),
  }

  const msgRef = await addDoc(collection(db, 'chats', chatId, 'messages'), msgPayload)

  const chatUpdates = {
    lastMessage: {
      id: msgRef.id,
      text: previewText,
      senderId: senderProfile.uid,
      senderName: senderProfile.displayName || senderProfile.username,
      type: 'poll',
      createdAt: new Date().toISOString(),
    },
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    [`lastReadAt.${senderProfile.uid}`]: serverTimestamp(),
    [`lastDeliveredAt.${senderProfile.uid}`]: serverTimestamp(),
    [`unreadCounts.${senderProfile.uid}`]: 0,
  }

  for (const uid of memberIds) {
    if (uid !== senderProfile.uid) {
      chatUpdates[`unreadCounts.${uid}`] = increment(1)
    }
  }

  await updateDoc(doc(db, 'chats', chatId), chatUpdates)
  return msgRef.id
}

export async function voteInPoll({ chatId, message, optionId, uid }) {
  if (!chatId || !message?.id || !message?.poll || !uid) return
  if (message.poll.closed) return

  const msgRef = doc(db, 'chats', chatId, 'messages', message.id)
  const currentVotes = message.poll.votes || {}
  const alreadyVotedThis = Array.isArray(currentVotes[optionId]) && currentVotes[optionId].includes(uid)

  if (message.poll.allowMultiple) {
    await updateDoc(msgRef, {
      [`poll.votes.${optionId}`]: alreadyVotedThis ? arrayRemove(uid) : arrayUnion(uid),
    })
  } else {
    // Single-choice poll: remove uid from all other options and toggle on optionId
    const nextVotes = {}
    for (const opt of message.poll.options || []) {
      const existing = Array.isArray(currentVotes[opt.id]) ? currentVotes[opt.id] : []
      const withoutMe = existing.filter((id) => id !== uid)
      if (opt.id === optionId && !alreadyVotedThis) {
        nextVotes[opt.id] = [...withoutMe, uid]
      } else {
        nextVotes[opt.id] = withoutMe
      }
    }
    await updateDoc(msgRef, {
      'poll.votes': nextVotes,
    })
  }
}

export async function toggleClosePoll({ chatId, messageId, closed }) {
  if (!chatId || !messageId) return
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    'poll.closed': !!closed,
  })
}

export async function editMessage({ chatId, messageId, newText }) {
  const clean = (newText || '').trim()
  if (!clean) return
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: clean,
    editedAt: serverTimestamp(),
  })
}

export async function unsendMessage({ chatId, messageId }) {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    text: '',
    attachments: [],
    deletedForAll: true,
    editedAt: serverTimestamp(),
  })
}

export async function deleteMessageForMe({ chatId, messageId, uid }) {
  await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    deletedFor: arrayUnion(uid),
  })
}

export async function toggleReaction({ chatId, messageId, emoji, uid, hasReacted }) {
  const msgRef = doc(db, 'chats', chatId, 'messages', messageId)
  await updateDoc(msgRef, {
    [`reactions.${emoji}`]: hasReacted ? arrayRemove(uid) : arrayUnion(uid),
  })
}

export async function togglePinMessage({ chatId, message, isPinned, currentPinned = [], uid }) {
  const chatRef = doc(db, 'chats', chatId)
  if (isPinned) {
    const filtered = currentPinned.filter((m) => m.id !== message.id)
    await updateDoc(chatRef, { pinnedMessages: filtered })
  } else {
    const entry = {
      id: message.id,
      text: message.text || (message.type === 'image' ? '📷 Photo' : message.type === 'voice' ? '🎤 Voice note' : '📎 Attachment'),
      senderId: message.senderId,
      senderName: message.senderName,
      type: message.type,
      pinnedBy: uid,
      pinnedAt: new Date().toISOString(),
    }
    const next = [entry, ...currentPinned.filter((m) => m.id !== message.id)].slice(0, 10)
    await updateDoc(chatRef, { pinnedMessages: next })
  }
}

export async function markChatRead(chatId, uid) {
  if (!chatId || !uid) return
  await updateDoc(doc(db, 'chats', chatId), {
    [`unreadCounts.${uid}`]: 0,
    [`lastReadAt.${uid}`]: serverTimestamp(),
    [`lastDeliveredAt.${uid}`]: serverTimestamp(),
  }).catch(() => {})
}

export async function markChatDelivered(chatId, uid) {
  if (!chatId || !uid) return
  await updateDoc(doc(db, 'chats', chatId), {
    [`lastDeliveredAt.${uid}`]: serverTimestamp(),
  }).catch(() => {})
}

export async function setTypingStatus(chatId, uid, isTyping) {
  if (!chatId || !uid) return
  await updateDoc(doc(db, 'chats', chatId), {
    [`typing.${uid}`]: isTyping ? Date.now() : deleteField(),
  }).catch(() => {})
}

export async function toggleChatFlag(chatId, uid, field, active) {
  if (!['pinnedBy', 'mutedBy', 'archivedBy'].includes(field)) return
  await updateDoc(doc(db, 'chats', chatId), {
    [field]: active ? arrayUnion(uid) : arrayRemove(uid),
  })
}

export async function updateChatBackground(chatId, backgroundURL, actorProfile) {
  if (!chatId) return
  await updateDoc(doc(db, 'chats', chatId), {
    backgroundURL: backgroundURL || null,
    updatedAt: serverTimestamp(),
  })

  if (actorProfile?.uid) {
    const actionText = backgroundURL
      ? `${actorProfile.displayName} changed the chat background`
      : `${actorProfile.displayName} removed the chat background`
    await addDoc(collection(db, 'chats', chatId, 'messages'), {
      chatId,
      senderId: actorProfile.uid,
      senderName: actorProfile.displayName,
      type: 'system',
      text: actionText,
      attachments: [],
      reactions: {},
      deletedForAll: false,
      deletedFor: [],
      createdAt: serverTimestamp(),
    })
  }
}

/**
 * Fetch older messages for infinite scroll pagination.
 */
export async function fetchOlderMessages(chatId, oldestDocSnap, pageSize = 30) {
  if (!chatId || !oldestDocSnap) return { messages: [], lastSnap: null }
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    startAfter(oldestDocSnap),
    limit(pageSize),
  )
  const snap = await getDocs(q)
  const docs = snap.docs
  const messages = docs.map((d) => ({ id: d.id, ...d.data() })).reverse()
  return {
    messages,
    lastSnap: docs[docs.length - 1] || null,
    hasMore: docs.length === pageSize,
  }
}

/* ---------------- Group Administration & Invite Links ---------------- */

export async function updateGroupDetails(chatId, { title, description, avatarURL }) {
  const patch = { updatedAt: serverTimestamp() }
  if (title !== undefined) patch.title = title.trim()
  if (description !== undefined) patch.description = description.trim()
  if (avatarURL !== undefined) patch.avatarURL = avatarURL
  await updateDoc(doc(db, 'chats', chatId), patch)
}

export async function setGroupMemberRole(chatId, targetUid, role) {
  await updateDoc(doc(db, 'chats', chatId), {
    [`roles.${targetUid}`]: role,
    updatedAt: serverTimestamp(),
  })
}

export async function addMembersToGroup(chatId, newProfiles, actorProfile) {
  if (!newProfiles.length) return
  const patch = {
    memberIds: arrayUnion(...newProfiles.map((p) => p.uid)),
    updatedAt: serverTimestamp(),
  }
  for (const p of newProfiles) {
    patch[`memberInfo.${p.uid}`] = toMiniProfile(p)
    patch[`roles.${p.uid}`] = 'member'
    patch[`unreadCounts.${p.uid}`] = 0
  }
  await updateDoc(doc(db, 'chats', chatId), patch)

  const names = newProfiles.map((p) => p.displayName).join(', ')
  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    chatId,
    senderId: actorProfile.uid,
    senderName: actorProfile.displayName,
    type: 'system',
    text: `${actorProfile.displayName} added ${names} to the group`,
    attachments: [],
    reactions: {},
    deletedForAll: false,
    deletedFor: [],
    createdAt: serverTimestamp(),
  })
}

export async function removeGroupMember(chatId, targetProfile, actorProfile) {
  await updateDoc(doc(db, 'chats', chatId), {
    memberIds: arrayRemove(targetProfile.uid),
    [`roles.${targetProfile.uid}`]: deleteField(),
    [`unreadCounts.${targetProfile.uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })

  const text =
    targetProfile.uid === actorProfile.uid
      ? `${actorProfile.displayName} left the group`
      : `${actorProfile.displayName} removed ${targetProfile.displayName}`

  await addDoc(collection(db, 'chats', chatId, 'messages'), {
    chatId,
    senderId: actorProfile.uid,
    senderName: actorProfile.displayName,
    type: 'system',
    text,
    attachments: [],
    reactions: {},
    deletedForAll: false,
    deletedFor: [],
    createdAt: serverTimestamp(),
  })
}

export async function regenerateGroupInvite(chatId, inviteEnabled = true) {
  const inviteCode = randomInviteCode(10)
  await updateDoc(doc(db, 'chats', chatId), {
    inviteCode,
    inviteEnabled,
    updatedAt: serverTimestamp(),
  })
  return inviteCode
}

export async function toggleGroupInvite(chatId, inviteEnabled) {
  await updateDoc(doc(db, 'chats', chatId), {
    inviteEnabled,
    updatedAt: serverTimestamp(),
  })
}

export async function findGroupByInviteCode(inviteCode) {
  const clean = (inviteCode || '').trim().toLowerCase()
  if (!clean) return null
  const q = query(
    collection(db, 'chats'),
    where('inviteCode', '==', clean),
    where('inviteEnabled', '==', true),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

export async function joinGroupByInviteCode(inviteCode, userProfile) {
  const group = await findGroupByInviteCode(inviteCode)
  if (!group) throw appError('app/invalid-invite')

  if ((group.memberIds || []).includes(userProfile.uid)) {
    return group.id
  }

  await updateDoc(doc(db, 'chats', group.id), {
    memberIds: arrayUnion(userProfile.uid),
    [`memberInfo.${userProfile.uid}`]: toMiniProfile(userProfile),
    [`roles.${userProfile.uid}`]: 'member',
    [`unreadCounts.${userProfile.uid}`]: 0,
    updatedAt: serverTimestamp(),
  })

  await addDoc(collection(db, 'chats', group.id, 'messages'), {
    chatId: group.id,
    senderId: userProfile.uid,
    senderName: userProfile.displayName,
    type: 'system',
    text: `${userProfile.displayName} joined via invite link`,
    attachments: [],
    reactions: {},
    deletedForAll: false,
    deletedFor: [],
    createdAt: serverTimestamp(),
  })

  return group.id
}

