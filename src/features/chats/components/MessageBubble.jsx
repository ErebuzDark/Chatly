import { memo, useRef, useState } from 'react'
import { Alert, App, Avatar, Button, Dropdown, Image, Modal, Popover, Slider, Tooltip } from 'antd'
import {
  BarChartOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  FilePdfOutlined,
  LinkOutlined,
  LockOutlined,
  MoreOutlined,
  PauseCircleFilled,
  PlayCircleFilled,
  PushpinOutlined,
  RollbackOutlined,
  ShareAltOutlined,
  SmileOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import {
  cn,
  extractUrls,
  formatBytes,
  formatDuration,
  formatMessageTime,
  getInitials,
  toDate,
} from '@/lib/utils'
import {
  getCloudinaryDownloadUrl,
  getPdfPreviewImageUrl,
} from '@/services/cloudinary'
import LinkEmbedPreview from '@/features/chats/components/LinkEmbedPreview'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥']

function VoiceNotePlayer({ url, duration = 0, isOwn }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDur, setTotalDur] = useState(duration || 0)

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      el.play().catch(() => {})
    }
  }

  return (
    <div className="flex w-[min(200px,62vw)] sm:w-56 max-w-full items-center gap-2.5 py-1">
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setCurrentTime(0)
        }}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) setTotalDur(d)
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-2xl text-current opacity-90 hover:opacity-100"
      >
        {playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
      </button>
      <div className="flex-1">
        <Slider
          min={0}
          max={totalDur || 1}
          step={0.1}
          value={currentTime}
          tooltip={{ formatter: null }}
          onChange={(v) => {
            if (audioRef.current) audioRef.current.currentTime = v
            setCurrentTime(v)
          }}
          className="!my-1"
        />
        <div
          className={cn(
            'flex justify-between text-[10px]',
            isOwn ? 'text-white/80' : 'text-muted',
          )}
        >
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(totalDur)}</span>
        </div>
      </div>
    </div>
  )
}

function LinkPreviewCard({ url, isOwn }) {
  let hostname = url
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    // ignore
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'mt-2 flex items-center gap-2.5 rounded-md border p-2 text-xs no-underline transition-opacity hover:opacity-90',
        isOwn
          ? 'border-white/20 bg-black/15 text-white'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-foreground',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary/20 text-primary">
        <LinkOutlined />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{hostname}</div>
        <div className="truncate opacity-75">{url}</div>
      </div>
    </a>
  )
}

function renderTextWithLinks(text = '', isOwn) {
  const parts = text.split(/(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi)
  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noreferrer"
          className={cn('underline break-all', isOwn ? 'text-white' : 'text-primary')}
        >
          {part}
        </a>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function PollCard({ message, chat, currentUid, isOwn, onVotePoll, onToggleClosePoll }) {
  const poll = message.poll
  if (!poll) return null

  const options = poll.options || []
  const votesMap = poll.votes || {}
  const isClosed = !!poll.closed

  // Calculate unique voters and total votes
  const allVoterUids = new Set()
  let totalVotes = 0
  for (const opt of options) {
    const arr = Array.isArray(votesMap[opt.id]) ? votesMap[opt.id] : []
    totalVotes += arr.length
    arr.forEach((uid) => allVoterUids.add(uid))
  }

  return (
    <div className="w-[min(230px,68vw)] sm:w-68 max-w-full space-y-2.5 py-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 font-semibold leading-snug break-words">{poll.question}</div>
        <BarChartOutlined className={cn('shrink-0 text-base', isOwn ? 'text-white/80' : 'text-primary')} />
      </div>

      <div className={cn('flex items-center gap-2 text-[11px]', isOwn ? 'text-white/80' : 'text-muted')}>
        <span>{poll.allowMultiple ? 'Select one or more' : 'Select one'}</span>
        {isClosed && (
          <span className="inline-flex items-center gap-1 font-semibold">
            • <LockOutlined /> Closed
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {options.map((opt) => {
          const voterIds = Array.isArray(votesMap[opt.id]) ? votesMap[opt.id] : []
          const count = voterIds.length
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
          const myVote = voterIds.includes(currentUid)
          const voterNames = voterIds
            .map((uid) => chat?.memberInfo?.[uid]?.displayName || 'Member')
            .join(', ')

          return (
            <Tooltip key={opt.id} title={count > 0 ? `Voted by: ${voterNames}` : null}>
              <button
                type="button"
                disabled={isClosed}
                onClick={() => onVotePoll?.(message, opt.id)}
                className={cn(
                  'relative w-full overflow-hidden rounded-lg border px-2.5 sm:px-3 py-2 text-left text-xs transition-all',
                  isClosed ? 'cursor-not-allowed opacity-85' : 'cursor-pointer hover:opacity-95',
                  isOwn
                    ? myVote
                      ? 'border-white bg-white/20 text-white font-semibold'
                      : 'border-white/25 bg-black/15 text-white'
                    : myVote
                      ? 'border-primary bg-primary/15 text-foreground font-semibold'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-foreground',
                )}
              >
                {/* Progress bar background */}
                <div
                  style={{ width: `${pct}%` }}
                  className={cn(
                    'pointer-events-none absolute inset-y-0 left-0 transition-all duration-300',
                    isOwn ? 'bg-white/20' : 'bg-primary/20',
                  )}
                />
                <div className="relative flex items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 break-words">
                    {myVote ? (
                      <CheckCircleFilled className="shrink-0" />
                    ) : (
                      <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-current opacity-60" />
                    )}
                    <span className="min-w-0 break-words">{opt.text}</span>
                  </span>
                  <span className="shrink-0 text-[11px] opacity-85">
                    {count} ({pct}%)
                  </span>
                </div>
              </button>
            </Tooltip>
          )
        })}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px]',
          isOwn ? 'text-white/80' : 'text-muted',
        )}
      >
        <span>
          {allVoterUids.size} {allVoterUids.size === 1 ? 'member' : 'members'} voted ({totalVotes}{' '}
          {totalVotes === 1 ? 'vote' : 'votes'})
        </span>
        {isOwn && (
          <button
            type="button"
            onClick={() => onToggleClosePoll?.(message, !isClosed)}
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-current underline opacity-90 hover:opacity-100"
          >
            {isClosed ? 'Reopen poll' : 'End poll'}
          </button>
        )}
      </div>
    </div>
  )
}

function FileAttachmentCard({ file, isOwn }) {
  const { message } = App.useApp()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSrc, setPreviewSrc] = useState(null)
  const [loadingFile, setLoadingFile] = useState(false)
  const [aclBlocked, setAclBlocked] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)

  const fileName = file.name || 'Attachment'
  const isPdf =
    file.format === 'pdf' ||
    file.mimeType === 'application/pdf' ||
    /\.pdf(\?|$)/i.test(fileName) ||
    /\.pdf(\?|$)/i.test(file.url || '')
  const isDocPreviewable =
    isPdf || /\.(docx?|xlsx?|pptx?|txt|csv)$/i.test(fileName)

  const pdfThumbUrl = isPdf && !thumbFailed ? getPdfPreviewImageUrl(file.url) : null

  const triggerBrowserDownload = (href, name) => {
    const a = document.createElement('a')
    a.href = href
    a.download = name || 'download'
    a.rel = 'noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const handleDownload = async (e) => {
    e?.stopPropagation?.()
    if (file.dataUrl) {
      triggerBrowserDownload(file.dataUrl, fileName)
      return
    }
    if (!file.url) return

    setLoadingFile(true)
    try {
      const resp = await fetch(file.url)
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          setAclBlocked(true)
          setPreviewOpen(true)
          return
        }
        throw new Error(`HTTP ${resp.status}`)
      }
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      triggerBrowserDownload(blobUrl, fileName)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000)
    } catch {
      // Fallback to direct download link
      window.open(getCloudinaryDownloadUrl(file.url), '_blank', 'noopener,noreferrer')
    } finally {
      setLoadingFile(false)
    }
  }

  const handlePreview = async (e) => {
    e?.stopPropagation?.()
    if (file.dataUrl) {
      setAclBlocked(false)
      setPreviewSrc(file.dataUrl)
      setPreviewOpen(true)
      return
    }
    if (!file.url) return

    setLoadingFile(true)
    try {
      const resp = await fetch(file.url)
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          setAclBlocked(true)
          setPreviewSrc(null)
          setPreviewOpen(true)
          return
        }
        throw new Error(`HTTP ${resp.status}`)
      }
      const rawBlob = await resp.blob()
      const finalBlob =
        isPdf && rawBlob.type !== 'application/pdf'
          ? new Blob([rawBlob], { type: 'application/pdf' })
          : rawBlob
      const blobUrl = URL.createObjectURL(finalBlob)
      setAclBlocked(false)
      setPreviewSrc(blobUrl)
      setPreviewOpen(true)
    } catch {
      if (isDocPreviewable) {
        setAclBlocked(false)
        setPreviewSrc(
          `https://docs.google.com/gview?url=${encodeURIComponent(file.url)}&embedded=true`,
        )
        setPreviewOpen(true)
      } else {
        message.info('Opening file in a new tab...')
        window.open(file.url, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setLoadingFile(false)
    }
  }

  return (
    <>
      <div
        className={cn(
          'mb-1.5 w-[min(235px,68vw)] sm:w-72 max-w-full overflow-hidden rounded-xl border text-xs transition-all',
          isOwn
            ? 'border-white/25 bg-black/15 text-white'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-foreground',
        )}
      >
        {/* Optional Page-1 Thumbnail for PDFs */}
        {pdfThumbUrl && (
          <div
            onClick={handlePreview}
            className="relative h-32 w-full cursor-pointer overflow-hidden border-b border-white/15 bg-black/20"
          >
            <img
              src={pdfThumbUrl}
              alt={fileName}
              className="h-full w-full object-cover object-top transition-transform hover:scale-105"
              onError={() => setThumbFailed(true)}
            />
            <span className="absolute top-2 left-2 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white shadow">
              PDF
            </span>
          </div>
        )}

        <div className="flex items-center gap-2.5 p-2.5">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg',
              isPdf
                ? isOwn
                  ? 'bg-white/20 text-white'
                  : 'bg-red-500/15 text-red-400'
                : isOwn
                  ? 'bg-white/20 text-white'
                  : 'bg-primary/15 text-primary',
            )}
          >
            {isPdf ? <FilePdfOutlined /> : <FileOutlined />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" title={fileName}>
              {fileName}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] opacity-75">
              <span>{isPdf ? 'PDF Document' : 'File'}</span>
              {file.size > 0 && <span>• {formatBytes(file.size)}</span>}
            </div>
          </div>
        </div>

        <div
          className={cn(
            'flex items-center border-t px-2 py-1',
            isOwn ? 'border-white/15 bg-black/10' : 'border-[var(--color-border)] bg-black/5',
          )}
        >
          {isDocPreviewable && (
            <button
              type="button"
              disabled={loadingFile}
              onClick={handlePreview}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border-0 bg-transparent py-1 text-[11px] font-semibold text-current opacity-90 hover:opacity-100"
            >
              <EyeOutlined /> {loadingFile ? 'Loading...' : 'Preview'}
            </button>
          )}
          <button
            type="button"
            disabled={loadingFile}
            onClick={handleDownload}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border-0 bg-transparent py-1 text-[11px] font-semibold text-current opacity-90 hover:opacity-100"
          >
            <DownloadOutlined /> Download
          </button>
        </div>
      </div>

      <Modal
        title={fileName}
        open={previewOpen}
        onCancel={() => {
          setPreviewOpen(false)
          if (previewSrc && previewSrc.startsWith('blob:')) {
            URL.revokeObjectURL(previewSrc)
          }
          setPreviewSrc(null)
        }}
        width="min(860px, 96vw)"
        centered
        footer={[
          <Button key="close" onClick={() => setPreviewOpen(false)}>
            Close
          </Button>,
          !aclBlocked && (
            <Button
              key="download"
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownload}
            >
              Download
            </Button>
          ),
        ]}
      >
        {aclBlocked ? (
          <div className="space-y-4">
            <Alert
              type="warning"
              showIcon
              message="Cloudinary PDF / ZIP Delivery is Currently Disabled on Your Cloudinary Account"
              description={
                <div className="space-y-1.5 text-xs">
                  <p className="m-0">
                    By default, Cloudinary Free accounts block direct browser delivery of{' '}
                    <strong>.pdf</strong> and <strong>.zip</strong> URLs (HTTP 401) until enabled in
                    your Cloudinary dashboard:
                  </p>
                  <ol className="m-0 pl-4 space-y-1">
                    <li>
                      Open your <strong>Cloudinary Console</strong> → click{' '}
                      <strong>Settings</strong> (gear icon).
                    </li>
                    <li>
                      Go to the <strong>Security</strong> tab.
                    </li>
                    <li>
                      Check <strong>&quot;Allow delivery of PDF and ZIP files&quot;</strong> and
                      click <strong>Save</strong>.
                    </li>
                  </ol>
                  <p className="m-0 pt-1 text-muted">
                    Note: Newly sent PDFs under 550 KB now also include an automatic inline backup so
                    they open immediately even before changing that setting.
                  </p>
                </div>
              }
            />
            {pdfThumbUrl && (
              <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-black/20 p-2 text-center">
                <div className="mb-1.5 text-xs font-medium text-muted">
                  Page 1 Preview ({fileName})
                </div>
                <img
                  src={pdfThumbUrl}
                  alt={fileName}
                  className="mx-auto max-h-[60vh] w-auto rounded object-contain"
                />
              </div>
            )}
          </div>
        ) : previewSrc ? (
          <iframe
            src={previewSrc}
            title={fileName}
            className="h-[72vh] w-full rounded-lg border border-[var(--color-border)] bg-white"
          />
        ) : null}
      </Modal>
    </>
  )
}

const EMPTY_SEEN = []

const MessageBubble = memo(function MessageBubble({
  message,
  chat,
  currentUid,
  isGroup,
  isPinned,
  seenByUsers = EMPTY_SEEN,
  onReply,
  onEdit,
  onUnsend,
  onDeleteForMe,
  onReaction,
  onTogglePin,
  onForward,
  onVotePoll,
  onToggleClosePoll,
  onScrollToMessage,
}) {
  const { message: appMessage } = App.useApp()
  const [reactionOpen, setReactionOpen] = useState(false)

  if (message.type === 'system') {
    return (
      <div className="my-2 text-center">
        <span className="inline-block rounded-full bg-[var(--color-surface-raised)] px-3 py-1 text-xs text-muted">
          {message.text}
        </span>
      </div>
    )
  }

  const isOwn = message.senderId === currentUid
  const isDeleted = !!message.deletedForAll
  const urls = !isDeleted ? extractUrls(message.text) : []
  const liveMember = chat?.memberInfo?.[message.senderId]
  const senderAvatar = liveMember?.photoURL || message.senderPhoto || undefined
  const senderDisplayName = liveMember?.displayName || message.senderName || 'User'

  // Compute Sent / Delivered / Seen status for own messages
  let receiptStatus = 'sent'
  if (isOwn && chat) {
    const msgTime = toDate(message.createdAt)?.getTime() || 0
    const otherMembers = (chat.memberIds || []).filter((id) => id !== currentUid)
    const seenBySomeone = otherMembers.some((uid) => {
      const readTime = toDate(chat.lastReadAt?.[uid])?.getTime() || 0
      return readTime >= msgTime && msgTime > 0
    })
    const deliveredToSomeone = otherMembers.some((uid) => {
      const delivTime = toDate(chat.lastDeliveredAt?.[uid])?.getTime() || 0
      return delivTime >= msgTime && msgTime > 0
    })
    if (seenBySomeone) receiptStatus = 'seen'
    else if (deliveredToSomeone) receiptStatus = 'delivered'
  }

  const reactionEntries = Object.entries(message.reactions || {}).filter(
    ([, uids]) => Array.isArray(uids) && uids.length > 0,
  )

  const menuItems = [
    !isDeleted && {
      key: 'quick-reactions',
      label: (
        <div
          className="flex items-center gap-1 py-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {QUICK_REACTIONS.map((emoji) => {
            const reacted = (message.reactions?.[emoji] || []).includes(currentUid)
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReaction?.(message, emoji, reacted)}
                className={cn(
                  'cursor-pointer rounded-md border-0 p-1 text-base transition-transform hover:scale-125',
                  reacted ? 'bg-primary/20' : 'bg-transparent',
                )}
              >
                {emoji}
              </button>
            )
          })}
        </div>
      ),
    },
    !isDeleted && { type: 'divider' },
    {
      key: 'reply',
      icon: <UndoOutlined />,
      label: 'Reply',
      onClick: () => onReply?.(message),
    },
    !isDeleted &&
      message.text && {
        key: 'copy',
        icon: <CopyOutlined />,
        label: 'Copy text',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(message.text)
            appMessage.success('Copied to clipboard')
          } catch {
            appMessage.error('Failed to copy')
          }
        },
      },
    !isDeleted && {
      key: 'forward',
      icon: <ShareAltOutlined />,
      label: 'Forward',
      onClick: () => onForward?.(message),
    },
    !isDeleted && {
      key: 'pin',
      icon: <PushpinOutlined />,
      label: isPinned ? 'Unpin message' : 'Pin message',
      onClick: () => onTogglePin?.(message, isPinned),
    },
    isOwn &&
      !isDeleted &&
      message.type === 'text' && {
        key: 'edit',
        icon: <EditOutlined />,
        label: 'Edit message',
        onClick: () => onEdit?.(message),
      },
    {
      key: 'deleteForMe',
      icon: <DeleteOutlined />,
      label: 'Delete for me',
      onClick: () => onDeleteForMe?.(message),
    },
    isOwn &&
      !isDeleted && {
        key: 'unsend',
        icon: <RollbackOutlined />,
        danger: true,
        label: 'Unsend for everyone',
        onClick: () => onUnsend?.(message),
      },
  ].filter(Boolean)

  const imageAttachments = (message.attachments || []).filter((a) =>
    a.type?.startsWith('image'),
  )
  const videoAttachments = (message.attachments || []).filter((a) =>
    a.type?.startsWith('video'),
  )
  const voiceAttachments = (message.attachments || []).filter(
    (a) => a.type === 'voice' || a.type?.startsWith('audio'),
  )
  const fileAttachments = (message.attachments || []).filter(
    (a) =>
      !a.type?.startsWith('image') &&
      !a.type?.startsWith('video') &&
      a.type !== 'voice' &&
      !a.type?.startsWith('audio'),
  )

  return (
    <div id={`msg-${message.id}`} className="py-1 transition-colors">
      <div
        className={cn(
          'group flex min-w-0 w-full items-end gap-1.5 sm:gap-2',
          isOwn ? 'flex-row-reverse' : 'flex-row',
        )}
      >
      {!isOwn && (
        <Avatar
          key={senderAvatar || 'no-avatar'}
          size={28}
          src={senderAvatar}
          className="shrink-0 bg-primary text-xs sm:h-[30px] sm:w-[30px]"
        >
          {getInitials(senderDisplayName)}
        </Avatar>
      )}

      <div
        className={cn(
          'flex min-w-0 max-w-[88%] sm:max-w-[74%] flex-col',
          isOwn ? 'items-end' : 'items-start',
        )}
      >
        {isGroup && !isOwn && (
          <span className="mb-0.5 ml-1 text-[11px] font-medium text-muted">
            {senderDisplayName}
          </span>
        )}

        <div
          className={cn(
            'flex min-w-0 max-w-full items-center gap-0.5 sm:gap-1',
            isOwn ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {/* Bubble */}
          <div
            className={cn(
              'relative min-w-0 max-w-full overflow-hidden rounded-2xl px-3 py-2 sm:px-3.5 text-sm shadow-sm [overflow-wrap:anywhere] [word-break:break-word]',
              isDeleted
                ? 'border border-dashed border-[var(--color-border)] bg-transparent italic text-muted'
                : isOwn
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'glass rounded-bl-sm text-foreground',
            )}
          >
            {/* Forwarded label */}
            {!isDeleted && message.forwardedFrom && (
              <div
                className={cn(
                  'mb-1 flex items-center gap-1 text-[11px] italic',
                  isOwn ? 'text-white/80' : 'text-muted',
                )}
              >
                <ShareAltOutlined /> Forwarded
              </div>
            )}

            {/* Reply quote */}
            {!isDeleted && message.replyTo && (
              <div
                onClick={() => onScrollToMessage?.(message.replyTo.id)}
                className={cn(
                  'mb-1.5 cursor-pointer rounded-md border-l-2 px-2.5 py-1 text-xs transition-opacity hover:opacity-85',
                  isOwn
                    ? 'border-white bg-black/15 text-white/90'
                    : 'border-primary bg-primary/10 text-foreground',
                )}
              >
                <div className="font-semibold">{message.replyTo.senderName}</div>
                <div className="truncate opacity-80">
                  {message.replyTo.text || `(${message.replyTo.type})`}
                </div>
              </div>
            )}

            {isDeleted ? (
              <span>This message was unsent</span>
            ) : (
              <>
                {/* Image Attachments with Lightbox */}
                {imageAttachments.length > 0 && (
                  <Image.PreviewGroup>
                    <div
                      className={cn(
                        'mb-1.5 grid max-w-[260px] sm:max-w-[300px] gap-1.5 overflow-hidden rounded-lg',
                        imageAttachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
                      )}
                    >
                      {imageAttachments.map((img, idx) => (
                        <Image
                          key={idx}
                          src={img.url}
                          alt={img.name || 'Image'}
                          className="max-h-64 w-full rounded-md object-cover"
                        />
                      ))}
                    </div>
                  </Image.PreviewGroup>
                )}

                {/* Video Attachments */}
                {videoAttachments.map((vid, idx) => (
                  <div
                    key={idx}
                    className="mb-1.5 w-[min(240px,68vw)] sm:w-72 max-w-full overflow-hidden rounded-lg bg-black"
                  >
                    <video
                      src={vid.url}
                      controls
                      preload="metadata"
                      className="max-h-64 w-full rounded-lg"
                    />
                  </div>
                ))}

                {/* Voice Notes */}
                {voiceAttachments.map((v, idx) => (
                  <VoiceNotePlayer
                    key={idx}
                    url={v.url}
                    duration={v.duration}
                    isOwn={isOwn}
                  />
                ))}

                {/* File / PDF Attachments */}
                {fileAttachments.map((f, idx) => (
                  <FileAttachmentCard key={idx} file={f} isOwn={isOwn} />
                ))}

                {/* Poll Attachment (Group Chats) */}
                {message.type === 'poll' && message.poll ? (
                  <PollCard
                    message={message}
                    chat={chat}
                    currentUid={currentUid}
                    isOwn={isOwn}
                    onVotePoll={onVotePoll}
                    onToggleClosePoll={onToggleClosePoll}
                  />
                ) : (
                  /* Text body */
                  message.text && (
                    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] [word-break:break-word] leading-relaxed">
                      {renderTextWithLinks(message.text, isOwn)}
                    </div>
                  )
                )}

                {/* Rich Link / Iframe Embed Preview for first detected URL */}
                {urls.length > 0 && <LinkEmbedPreview url={urls[0]} isOwn={isOwn} />}
              </>
            )}

            {/* Timestamp + Edited + Receipt */}
            <div
              className={cn(
                'mt-1 flex items-center justify-end gap-1 text-[10px]',
                isDeleted
                  ? 'text-muted'
                  : isOwn
                    ? 'text-white/75'
                    : 'text-muted',
              )}
            >
              {isPinned && <PushpinOutlined title="Pinned" />}
              {!isDeleted && message.editedAt && <span>(edited)</span>}
              <span>{formatMessageTime(message.createdAt)}</span>
              {isOwn && !isDeleted && (
                <Tooltip
                  title={
                    receiptStatus === 'seen'
                      ? 'Seen'
                      : receiptStatus === 'delivered'
                        ? 'Delivered'
                        : 'Sent'
                  }
                >
                  <span className="ml-0.5 inline-flex items-center">
                    {receiptStatus === 'seen' ? (
                      <CheckCircleFilled className="text-emerald-300" />
                    ) : receiptStatus === 'delivered' ? (
                      <CheckCircleOutlined />
                    ) : (
                      <CheckOutlined />
                    )}
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Hover / Tap Action Toolbar (compact single menu trigger on mobile so bubbles aren't squeezed) */}
          {!isDeleted && (
            <div className="flex shrink-0 items-center sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
              <div className="hidden sm:flex items-center">
                <Popover
                  open={reactionOpen}
                  onOpenChange={setReactionOpen}
                  trigger="click"
                  placement="top"
                  content={
                    <div className="flex items-center gap-1">
                      {QUICK_REACTIONS.map((emoji) => {
                        const reacted = (message.reactions?.[emoji] || []).includes(currentUid)
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              onReaction?.(message, emoji, reacted)
                              setReactionOpen(false)
                            }}
                            className={cn(
                              'cursor-pointer rounded-md border-0 p-1.5 text-lg transition-transform hover:scale-125',
                              reacted ? 'bg-primary/20' : 'bg-transparent',
                            )}
                          >
                            {emoji}
                          </button>
                        )
                      })}
                    </div>
                  }
                >
                  <Button type="text" size="small" icon={<SmileOutlined />} />
                </Popover>

                <Button
                  type="text"
                  size="small"
                  icon={<UndoOutlined />}
                  title="Reply"
                  onClick={() => onReply?.(message)}
                />
              </div>

              <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                <Button
                  type="text"
                  size="small"
                  icon={<MoreOutlined />}
                  className="!h-6 !w-6 !min-w-0 !p-0 text-muted opacity-60 hover:opacity-100 sm:!h-6 sm:!w-6 sm:opacity-100"
                />
              </Dropdown>
            </div>
          )}
        </div>

        {/* Reaction Pills */}
        {reactionEntries.length > 0 && (
          <div
            className={cn(
              'mt-1 flex flex-wrap gap-1',
              isOwn ? 'justify-end' : 'justify-start',
            )}
          >
            {reactionEntries.map(([emoji, uids]) => {
              const mine = uids.includes(currentUid)
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReaction?.(message, emoji, mine)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                    mine
                      ? 'border-primary bg-primary/20 text-foreground'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-raised)] text-muted',
                  )}
                >
                  <span>{emoji}</span>
                  <span>{uids.length}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>

    {/* Messenger-style Seen-By Mini Chat Heads */}
    {seenByUsers.length > 0 && (
      <div className="mt-0.5 flex items-center justify-end gap-1 pr-1">
        {seenByUsers.slice(0, 6).map((u) => {
          const seenTime = formatMessageTime(u.seenAt)
          return (
            <Tooltip
              key={u.uid}
              title={`Seen by ${u.displayName}${seenTime ? ` at ${seenTime}` : ''}`}
            >
              <Avatar
                key={`${u.uid}-${u.photoURL || 'no-avatar'}`}
                size={16}
                src={u.photoURL}
                className="bg-primary text-[9px] font-semibold ring-1 ring-[var(--color-surface)] transition-transform hover:scale-125"
              >
                {getInitials(u.displayName)}
              </Avatar>
            </Tooltip>
          )
        })}
        {seenByUsers.length > 6 && (
          <Tooltip
            title={`Also seen by ${seenByUsers
              .slice(6)
              .map((u) => u.displayName)
              .join(', ')}`}
          >
            <span className="rounded-full bg-[var(--color-surface-raised)] px-1.5 text-[10px] text-muted">
              +{seenByUsers.length - 6}
            </span>
          </Tooltip>
        )}
      </div>
    )}
    </div>
  )
})

export default MessageBubble

