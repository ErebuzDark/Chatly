import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Avatar, Button, Modal, Spin } from 'antd'
import {
  CompressOutlined,
  ExpandOutlined,
  EyeOutlined,
  GlobalOutlined,
  LinkOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useChats } from '@/features/chats/hooks/useChats'
import {
  findGroupByInviteCode,
  joinGroupByInviteCode,
} from '@/features/chats/api/chatsApi'
import { cn } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

// In-memory cache so we only fetch OpenGraph metadata once per URL
const metadataCache = new Map()

/**
 * Detects if a URL can be converted into a direct native embed iframe or media element.
 */
function getNativeEmbed(rawUrl) {
  try {
    const u = new URL(rawUrl)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()

    // 1. YouTube (watch, youtu.be, shorts, embed)
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
      let videoId = null
      if (host === 'youtu.be') {
        videoId = u.pathname.slice(1).split('/')[0]
      } else if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v')
      } else if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/')[2]
      }
      if (videoId && /^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
        return {
          kind: 'youtube',
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          aspectClass: 'aspect-video',
        }
      }
    }

    // 2. Spotify (track, album, playlist, episode)
    if (host === 'open.spotify.com') {
      const parts = u.pathname.split('/').filter(Boolean)
      if (
        parts.length >= 2 &&
        ['track', 'album', 'playlist', 'episode', 'show'].includes(parts[0])
      ) {
        return {
          kind: 'spotify',
          embedUrl: `https://open.spotify.com/embed/${parts[0]}/${parts[1]}`,
          height: parts[0] === 'track' ? 152 : 352,
        }
      }
    }

    // 3. Vimeo
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0]
      if (id && /^\d+$/.test(id)) {
        return {
          kind: 'vimeo',
          embedUrl: `https://player.vimeo.com/video/${id}`,
          aspectClass: 'aspect-video',
        }
      }
    }

    // 4. Loom
    if (host === 'loom.com' && u.pathname.startsWith('/share/')) {
      const id = u.pathname.split('/')[2]
      if (id) {
        return {
          kind: 'loom',
          embedUrl: `https://www.loom.com/embed/${id}`,
          aspectClass: 'aspect-video',
        }
      }
    }

    // 5. Internal Group Invite links (/join/:inviteCode)
    const joinMatch = u.pathname.match(/^\/join\/([^/?#]+)/i)
    if (joinMatch?.[1]) {
      return {
        kind: 'group-invite',
        inviteCode: decodeURIComponent(joinMatch[1]),
      }
    }

    // 6. Direct image / video file links
    if (/\.(gif|jpe?g|png|webp|avif)$/i.test(u.pathname)) {
      return { kind: 'image', mediaUrl: rawUrl }
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) {
      return { kind: 'video', mediaUrl: rawUrl }
    }
  } catch {
    // ignore invalid URL
  }
  return null
}

function GroupInviteEmbedCard({ inviteCode, isOwn }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { chats, selectChat } = useChats()
  const { message } = App.useApp()
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const codePart = (
          inviteCode.includes('--') ? inviteCode.split('--').pop() : inviteCode
        )
          .trim()
          .toLowerCase()
        const localMatch = chats.find(
          (c) =>
            c.type === 'group' &&
            c.inviteEnabled !== false &&
            (c.inviteCode || '').toLowerCase() === codePart,
        )
        if (localMatch) {
          if (active) {
            setGroup(localMatch)
            setLoading(false)
          }
          return
        }
        const found = await findGroupByInviteCode(inviteCode)
        if (active) setGroup(found)
      } catch {
        if (active) setGroup(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [inviteCode, chats])

  const alreadyMember = Boolean(
    profile?.uid && (group?.memberIds || []).includes(profile.uid),
  )

  const handleAction = async (e) => {
    e.stopPropagation()
    if (!group) {
      navigate(`/join/${encodeURIComponent(inviteCode)}`)
      return
    }
    if (alreadyMember) {
      selectChat(group.id)
      navigate(`/chats?chatId=${group.id}`)
      return
    }
    if (!profile) return
    setJoining(true)
    try {
      const chatId = await joinGroupByInviteCode(inviteCode, profile)
      message.success(`Joined ${group.title || 'group'}!`)
      selectChat(chatId)
      navigate(`/chats?chatId=${chatId}`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div
      className={cn(
        'mt-2 w-[min(235px,68vw)] sm:w-72 max-w-full overflow-hidden rounded-xl border p-3 text-xs',
        isOwn
          ? 'border-white/25 bg-black/20 text-white'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-foreground',
      )}
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-75">
        Group Chat Invite
      </div>
      {loading ? (
        <div className="py-2 text-center">
          <Spin size="small" />
        </div>
      ) : group ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar
              size={40}
              src={group.avatarURL || undefined}
              icon={!group.avatarURL ? <TeamOutlined /> : undefined}
              className="shrink-0 bg-primary font-semibold"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{group.title}</div>
              <div className="text-[11px] opacity-80">
                {(group.memberIds || []).length}{' '}
                {(group.memberIds || []).length === 1 ? 'member' : 'members'}
              </div>
            </div>
          </div>
          <Button
            size="small"
            type={isOwn ? 'default' : 'primary'}
            block
            loading={joining}
            onClick={handleAction}
          >
            {alreadyMember ? 'Open Group' : 'Join Group'}
          </Button>
        </div>
      ) : (
        <div className="opacity-80">
          This group invite link is invalid or has been disabled.
        </div>
      )}
    </div>
  )
}

export default function LinkEmbedPreview({ url, isOwn }) {
  const [meta, setMeta] = useState(() => metadataCache.get(url) || null)
  const [loadingMeta, setLoadingMeta] = useState(!metadataCache.has(url))
  const [showInlineIframe, setShowInlineIframe] = useState(false)
  const [modalIframeOpen, setModalIframeOpen] = useState(false)

  const nativeEmbed = getNativeEmbed(url)

  let hostname = url
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // ignore
  }

  useEffect(() => {
    if (
      nativeEmbed?.kind === 'image' ||
      nativeEmbed?.kind === 'video' ||
      nativeEmbed?.kind === 'group-invite'
    ) {
      setLoadingMeta(false)
      return undefined
    }
    if (metadataCache.has(url)) {
      setMeta(metadataCache.get(url))
      setLoadingMeta(false)
      return undefined
    }

    let active = true
    setLoadingMeta(true)
    fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return
        if (json?.status === 'success' && json.data) {
          const extracted = {
            title: json.data.title || hostname,
            description: json.data.description || '',
            image: json.data.image?.url || null,
            logo: json.data.logo?.url || null,
            publisher: json.data.publisher || hostname,
          }
          metadataCache.set(url, extracted)
          setMeta(extracted)
        } else {
          const fallback = { title: hostname, description: url, publisher: hostname }
          metadataCache.set(url, fallback)
          setMeta(fallback)
        }
      })
      .catch(() => {
        if (!active) return
        const fallback = { title: hostname, description: url, publisher: hostname }
        metadataCache.set(url, fallback)
        setMeta(fallback)
      })
      .finally(() => {
        if (active) setLoadingMeta(false)
      })

    return () => {
      active = false
    }
  }, [url, hostname, nativeEmbed?.kind])

  // Render internal Group Invite card
  if (nativeEmbed?.kind === 'group-invite') {
    return <GroupInviteEmbedCard inviteCode={nativeEmbed.inviteCode} isOwn={isOwn} />
  }

  // Render direct image or video URL
  if (nativeEmbed?.kind === 'image') {
    return (
      <div className="mt-2 overflow-hidden rounded-lg">
        <img
          src={nativeEmbed.mediaUrl}
          alt="Embedded link"
          className="max-h-64 w-auto rounded-lg object-cover"
        />
      </div>
    )
  }

  if (nativeEmbed?.kind === 'video') {
    return (
      <div className="mt-2 overflow-hidden rounded-lg">
        <video
          src={nativeEmbed.mediaUrl}
          controls
          className="max-h-64 w-full rounded-lg"
        />
      </div>
    )
  }

  // Render native YouTube / Spotify / Vimeo / Loom iframe directly
  if (nativeEmbed?.embedUrl) {
    return (
      <div
        className={cn(
          'mt-2 w-[min(235px,68vw)] sm:w-80 max-w-full overflow-hidden rounded-xl border',
          isOwn
            ? 'border-white/25 bg-black/20 text-white'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-foreground',
        )}
      >
        <div className={nativeEmbed.aspectClass || ''}>
          <iframe
            src={nativeEmbed.embedUrl}
            title={meta?.title || hostname}
            height={nativeEmbed.height || '100%'}
            className={cn(
              'w-full border-0',
              nativeEmbed.aspectClass ? 'h-full aspect-video' : '',
            )}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
          />
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px]">
          <span className="truncate font-medium">{meta?.title || hostname}</span>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'shrink-0 underline',
              isOwn ? 'text-white/90' : 'text-primary',
            )}
          >
            Open
          </a>
        </div>
      </div>
    )
  }

  // General website rich OpenGraph card + Interactive Iframe Preview option
  return (
    <div
      className={cn(
        'mt-2 w-[min(235px,68vw)] sm:w-80 max-w-full overflow-hidden rounded-xl border text-xs transition-all',
        isOwn
          ? 'border-white/25 bg-black/20 text-white'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-foreground',
      )}
    >
      {/* OpenGraph Preview Image */}
      {meta?.image && !showInlineIframe && (
        <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden">
          <img
            src={meta.image}
            alt={meta.title || hostname}
            className="h-36 w-full object-cover transition-transform hover:scale-105"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </a>
      )}

      {/* Optional Inline Interactive Iframe Preview */}
      {showInlineIframe && (
        <div className="relative h-60 w-full border-b border-white/15 bg-white">
          <iframe
            src={url}
            title={meta?.title || hostname}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            loading="lazy"
          />
        </div>
      )}

      {/* Metadata Details & Actions */}
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {meta?.logo ? (
              <img
                src={meta.logo}
                alt=""
                className="h-4 w-4 shrink-0 rounded-sm object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <GlobalOutlined className="shrink-0 opacity-75" />
            )}
            <span className="truncate text-[11px] font-medium opacity-80">
              {meta?.publisher || hostname}
            </span>
          </div>
          {loadingMeta && <Spin size="small" />}
        </div>

        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="block no-underline text-current hover:underline"
        >
          <div className="line-clamp-2 font-semibold leading-snug">
            {meta?.title || hostname}
          </div>
        </a>

        {meta?.description && meta.description !== url && (
          <div className="line-clamp-2 text-[11px] opacity-80 leading-relaxed">
            {meta.description}
          </div>
        )}

        {/* Embed / Preview Toolbar */}
        <div className="flex items-center justify-between gap-1.5 pt-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowInlineIframe((prev) => !prev)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] font-medium border transition-colors',
                isOwn
                  ? 'border-white/30 bg-white/15 text-white hover:bg-white/25'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] text-foreground hover:border-primary',
              )}
            >
              {showInlineIframe ? <CompressOutlined /> : <EyeOutlined />}
              <span>{showInlineIframe ? 'Hide Embed' : 'Embed Preview'}</span>
            </button>

            <button
              type="button"
              onClick={() => setModalIframeOpen(true)}
              title="Expand embed in modal"
              className={cn(
                'inline-flex cursor-pointer items-center justify-center rounded px-1.5 py-1 text-[11px] border transition-colors',
                isOwn
                  ? 'border-white/30 bg-white/15 text-white hover:bg-white/25'
                  : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] text-foreground hover:border-primary',
              )}
            >
              <ExpandOutlined />
            </button>
          </div>

          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-medium no-underline hover:underline',
              isOwn ? 'text-white/90' : 'text-primary',
            )}
          >
            <LinkOutlined />
            <span>Open</span>
          </a>
        </div>
      </div>

      {/* Expanded Iframe Preview Modal */}
      <Modal
        title={
          <div className="flex items-center justify-between pr-6">
            <span className="truncate text-sm font-semibold">
              {meta?.title || hostname}
            </span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-normal text-primary hover:underline"
            >
              Open in new tab ↗
            </a>
          </div>
        }
        open={modalIframeOpen}
        onCancel={() => setModalIframeOpen(false)}
        footer={null}
        width={860}
        destroyOnClose
      >
        <div className="space-y-2">
          <div className="h-[68vh] w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
            <iframe
              src={url}
              title={meta?.title || hostname}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          <p className="m-0 text-center text-xs text-muted">
            Note: Some websites restrict iframe embedding for security. If the preview above is blank,{' '}
            <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">
              open the link in a new tab
            </a>
            .
          </p>
        </div>
      </Modal>
    </div>
  )
}

