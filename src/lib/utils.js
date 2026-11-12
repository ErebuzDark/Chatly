import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function getInitials(name = '') {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Chatly'

export const DEFAULT_VISIBILITY = {
  email: false,
  birthday: true,
  location: true,
  links: true,
  lastSeen: true,
  onlineStatus: true,
}

export const DEFAULT_SETTINGS = {
  soundEnabled: true,
  desktopNotifications: true,
  inAppNotifications: true,
}

export function toDate(ts) {
  if (!ts) return null
  if (ts instanceof Date) return ts
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000)
  if (typeof ts === 'number' || typeof ts === 'string') {
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

export function formatRelativeTime(ts) {
  const date = toDate(ts)
  if (!date) return ''
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diffSec < 45) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatMessageTime(ts) {
  const date = toDate(ts)
  if (!date) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDateDivider(ts) {
  const date = toDate(ts)
  if (!date) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  })
}

export function formatBytes(bytes = 0) {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / 1024 ** i
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

export function formatDuration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * Checks if a user is considered actively online based on `isOnline` and a recent `lastSeenAt`
 * (within the last 6 minutes to tolerate missed unload events).
 */
export function isUserOnline(userDoc, viewerCanSeePresence = true) {
  if (!userDoc || !viewerCanSeePresence) return false
  const vis = { ...DEFAULT_VISIBILITY, ...userDoc.visibility }
  if (!vis.onlineStatus) return false
  if (!userDoc.isOnline) return false
  const lastSeen = toDate(userDoc.lastSeenAt)
  if (!lastSeen) return Boolean(userDoc.isOnline)
  return Date.now() - lastSeen.getTime() < 6 * 60 * 1000
}

export function formatPresenceLabel(userDoc, viewerCanSeePresence = true) {
  if (!userDoc || !viewerCanSeePresence) return ''
  const vis = { ...DEFAULT_VISIBILITY, ...userDoc.visibility }
  if (isUserOnline(userDoc, viewerCanSeePresence)) return 'Active now'
  if (!vis.lastSeen) return ''
  const lastSeen = toDate(userDoc.lastSeenAt)
  if (!lastSeen) return ''
  return `Last seen ${formatRelativeTime(lastSeen)}`
}

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi

export function extractUrls(text = '') {
  if (!text) return []
  return Array.from(new Set(text.match(URL_REGEX) || []))
}
