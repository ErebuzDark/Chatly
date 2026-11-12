import { memo, useRef, useState } from 'react'
import { Avatar, Button, Dropdown, Image, Popover, Slider, Tooltip } from 'antd'
import {
  BarChartOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
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
    <div className="min-w-60 sm:min-w-68 space-y-2.5 py-1">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold leading-snug">{poll.question}</div>
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
                  'relative w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs transition-all',
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
                  <span className="flex items-center gap-1.5 break-words">
                    {myVote ? <CheckCircleFilled /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-current opacity-60" />}
                    <span>{opt.text}</span>
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
          'flex items-center justify-between pt-0.5 text-[11px]',
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
            className="cursor-pointer border-0 bg-transparent p-0 text-[11px] font-semibold text-current underline opacity-90 hover:opacity-100"
          >
            {isClosed ? 'Reopen poll' : 'End poll'}
          </button>
        )}
      </div>
    </div>
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
    <div id={`msg-${message.id}`} className="py-1 transition-colors">
      <div
        className={cn(
          'group flex min-w-0 w-full items-end gap-2',
          isOwn ? 'flex-row-reverse' : 'flex-row',
        )}
      >
      {!isOwn && (
        <Avatar
          key={senderAvatar || 'no-avatar'}
          size={30}
          src={senderAvatar}
          className="shrink-0 bg-primary text-xs"
        >
          {getInitials(senderDisplayName)}
        </Avatar>
      )}

      <div
        className={cn(
          'flex min-w-0 max-w-[78%] sm:max-w-[70%] flex-col',
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
            'flex min-w-0 max-w-full items-center gap-1',
            isOwn ? 'flex-row-reverse' : 'flex-row',
          )}
        >
          {/* Bubble */}
          <div
            className={cn(
              'relative min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2 text-sm shadow-sm [overflow-wrap:anywhere] [word-break:break-word]',
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

