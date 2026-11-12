import { useRef, useState } from 'react'
import { Avatar, Button, Dropdown, Image, Popover, Slider, Tooltip } from 'antd'
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
  LinkOutlined,
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
    <div className="flex min-w-52 items-center gap-2.5 py-1">
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

export default function MessageBubble({
  message,
  chat,
  currentUid,
  isGroup,
  isPinned,
  onReply,
  onEdit,
  onUnsend,
  onDeleteForMe,
  onReaction,
  onTogglePin,
  onForward,
  onScrollToMessage,
}) {
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
    {
      key: 'reply',
      icon: <UndoOutlined />,
      label: 'Reply',
      onClick: () => onReply?.(message),
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
  const voiceAttachments = (message.attachments || []).filter(
    (a) => a.type === 'voice' || a.type?.startsWith('audio'),
  )
  const fileAttachments = (message.attachments || []).filter(
    (a) => !a.type?.startsWith('image') && a.type !== 'voice' && !a.type?.startsWith('audio'),
  )

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        'group flex items-end gap-2 py-1 transition-colors',
        isOwn ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      {!isOwn && (
        <Avatar size={30} src={message.senderPhoto} className="shrink-0 bg-primary text-xs">
          {getInitials(message.senderName)}
        </Avatar>
      )}

      <div className={cn('flex max-w-[78%] flex-col', isOwn ? 'items-end' : 'items-start')}>
        {isGroup && !isOwn && (
          <span className="mb-0.5 ml-1 text-[11px] font-medium text-muted">
            {message.senderName}
          </span>
        )}

        <div className={cn('flex items-center gap-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
          {/* Bubble */}
          <div
            className={cn(
              'relative rounded-2xl px-3.5 py-2 text-sm shadow-sm',
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
                        'mb-1.5 grid gap-1.5 overflow-hidden rounded-lg',
                        imageAttachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
                      )}
                    >
                      {imageAttachments.map((img, idx) => (
                        <Image
                          key={idx}
                          src={img.url}
                          alt={img.name || 'Image'}
                          className="max-h-72 w-full rounded-md object-cover"
                        />
                      ))}
                    </div>
                  </Image.PreviewGroup>
                )}

                {/* Voice Notes */}
                {voiceAttachments.map((v, idx) => (
                  <VoiceNotePlayer
                    key={idx}
                    url={v.url}
                    duration={v.duration}
                    isOwn={isOwn}
                  />
                ))}

                {/* File Attachments */}
                {fileAttachments.map((f, idx) => (
                  <a
                    key={idx}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    download={f.name}
                    className={cn(
                      'mb-1 flex items-center gap-2.5 rounded-lg border p-2.5 text-xs no-underline',
                      isOwn
                        ? 'border-white/25 bg-black/15 text-white'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-foreground',
                    )}
                  >
                    <FileOutlined className="text-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{f.name || 'Attachment'}</div>
                      {f.size > 0 && (
                        <div className="opacity-75">{formatBytes(f.size)}</div>
                      )}
                    </div>
                    <DownloadOutlined />
                  </a>
                ))}

                {/* Text body */}
                {message.text && (
                  <div className="whitespace-pre-wrap break-words leading-relaxed">
                    {renderTextWithLinks(message.text, isOwn)}
                  </div>
                )}

                {/* Link preview for first detected URL */}
                {urls.length > 0 && <LinkPreviewCard url={urls[0]} isOwn={isOwn} />}
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

          {/* Hover Action Toolbar */}
          {!isDeleted && (
            <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
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

              <Dropdown menu={{ items: menuItems }} trigger={['click']}>
                <Button type="text" size="small" icon={<MoreOutlined />} />
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
  )
}

