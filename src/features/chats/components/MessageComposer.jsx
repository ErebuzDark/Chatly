import { useEffect, useMemo, useRef, useState } from 'react'
import {
  App,
  Avatar,
  Button,
  Dropdown,
  Input,
  Popover,
  Progress,
  Segmented,
  Spin,
  Tooltip,
} from 'antd'
import {
  AudioOutlined,
  BarChartOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  FilePdfOutlined,
  PaperClipOutlined,
  PictureOutlined,
  PlusOutlined,
  SearchOutlined,
  SendOutlined,
  SmileOutlined,
  UndoOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { uploadAttachment, uploadVoiceNote } from '@/services/cloudinary'
import { setTypingStatus } from '@/features/chats/api/chatsApi'
import {
  CURATED_GIFS,
  getChatQuickEmoji,
  STICKER_PACK,
} from '@/features/chats/constants/chatThemes'
import { formatBytes, formatDuration, getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

const EMOJI_PALETTE = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩', '🥳', '🤔',
  '🙄', '😴', '😮', '😢', '😭', '😤', '🤯', '👍', '👎', '👏',
  '🙌', '🙏', '🤝', '💪', '❤️', '🔥', '✨', '🎉', '💯', '🚀',
  '👀', '💡', '✅', '⚡', '🌈', '☕', '🍕', '🎵', '🏆', '💎',
]

export default function MessageComposer({
  chat,
  chatId,
  currentUid,
  isGroup = false,
  replyTo,
  editingMessage,
  onClearReply,
  onClearEdit,
  onSend,
  onSaveEdit,
  onOpenPollModal,
  disabled = false,
}) {
  const { message } = App.useApp()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [sending, setSending] = useState(false)
  const [locating, setLocating] = useState(false)

  // Emoji / Sticker / GIF Picker state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState('emoji') // 'emoji' | 'stickers' | 'gifs'
  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState(CURATED_GIFS)
  const [loadingGifs, setLoadingGifs] = useState(false)

  // Voice recording & live waveform state
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const [liveBars, setLiveBars] = useState(() => Array(24).fill(0.18))
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const recordDurationRef = useRef(0)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)
  const recordedPeaksRef = useRef([])

  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const lastTypingWriteRef = useRef(0)
  const typingTimeoutRef = useRef(null)

  const quickEmoji = getChatQuickEmoji(chat)

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '')
    }
  }, [editingMessage])

  const cleanupAudioAnalyser = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }

  // Cleanup recording on unmount or chat switch
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      cleanupAudioAnalyser()
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [chatId])

  // Search GIFs via Tenor public API when pickerTab === 'gifs'
  useEffect(() => {
    if (!pickerOpen || pickerTab !== 'gifs') return undefined
    const q = gifQuery.trim()
    if (!q) {
      setGifResults(CURATED_GIFS)
      setLoadingGifs(false)
      return undefined
    }

    let active = true
    setLoadingGifs(true)
    const timer = setTimeout(() => {
      fetch(
        `https://g.tenor.com/v1/search?q=${encodeURIComponent(q)}&key=LIVDSRZULELA&limit=16`,
      )
        .then((r) => r.json())
        .then((data) => {
          if (!active) return
          const items = (data?.results || [])
            .map((item) => {
              const media = item.media?.[0]
              const url = media?.tinygif?.url || media?.gif?.url
              return url
                ? { id: item.id, title: item.content_description || q, url }
                : null
            })
            .filter(Boolean)
          setGifResults(items.length > 0 ? items : CURATED_GIFS)
        })
        .catch(() => {
          if (active) setGifResults(CURATED_GIFS)
        })
        .finally(() => {
          if (active) setLoadingGifs(false)
        })
    }, 320)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [gifQuery, pickerOpen, pickerTab])

  /* ---------------- @Mentions Autocomplete (Group Chats) ---------------- */
  const groupMembers = useMemo(() => {
    if (!isGroup || !chat?.memberIds) return []
    return (chat.memberIds || [])
      .filter((uid) => uid !== currentUid)
      .map((uid) => {
        const info = chat.memberInfo?.[uid] || {}
        return {
          uid,
          displayName: info.displayName || info.username || 'Member',
          username: info.username || (info.displayName || 'member').toLowerCase().replace(/\s+/g, ''),
          photoURL: info.photoURL || null,
        }
      })
  }, [isGroup, chat?.memberIds, chat?.memberInfo, currentUid])

  // Detect active `@query` token at the end of current text
  const mentionQueryMatch = useMemo(() => {
    if (!isGroup || editingMessage) return null
    const match = text.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/)
    if (!match) return null
    return match[1].toLowerCase()
  }, [isGroup, editingMessage, text])

  const mentionCandidates = useMemo(() => {
    if (mentionQueryMatch === null) return []
    return groupMembers
      .filter(
        (m) =>
          m.username.toLowerCase().includes(mentionQueryMatch) ||
          m.displayName.toLowerCase().includes(mentionQueryMatch),
      )
      .slice(0, 6)
  }, [groupMembers, mentionQueryMatch])

  const handleInsertMention = (member) => {
    const handle = member.username || member.displayName.replace(/\s+/g, '')
    setText((prev) => prev.replace(/@([a-zA-Z0-9_.]*)$/, `@${handle} `))
  }

  const extractMentionedUids = (rawText) => {
    if (!isGroup || !rawText) return []
    const lower = rawText.toLowerCase()
    const uids = []
    for (const m of groupMembers) {
      const uHandle = `@${(m.username || '').toLowerCase()}`
      const dHandle = `@${(m.displayName || '').toLowerCase().replace(/\s+/g, '')}`
      if ((uHandle.length > 1 && lower.includes(uHandle)) || (dHandle.length > 1 && lower.includes(dHandle))) {
        uids.push(m.uid)
      }
    }
    return uids
  }

  const triggerTyping = (val) => {
    if (!chatId || !currentUid) return
    if (!val.trim()) {
      setTypingStatus(chatId, currentUid, false)
      return
    }
    const now = Date.now()
    if (now - lastTypingWriteRef.current > 3500) {
      lastTypingWriteRef.current = now
      setTypingStatus(chatId, currentUid, true)
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus(chatId, currentUid, false)
    }, 5000)
  }

  const handleTextChange = (e) => {
    const val = e.target.value
    setText(val)
    if (!editingMessage) triggerTyping(val)
  }

  const uploadFilesList = async (files) => {
    if (!files.length || disabled || uploading) return

    setUploading(true)
    setUploadPct(0)

    try {
      const uploadedList = []
      for (const file of files.slice(0, 4)) {
        const res = await uploadAttachment(file, { onProgress: setUploadPct })
        const mime = (file.type || '').toLowerCase()
        const ext = (file.name || '').split('.').pop()?.toLowerCase() || ''

        let attType = 'file'
        if (mime.startsWith('image/')) attType = 'image'
        else if (mime.startsWith('video/')) attType = 'video'
        else if (mime.startsWith('audio/')) attType = 'audio'

        const item = {
          url: res.url,
          type: attType,
          mimeType: file.type || null,
          format: res.format || ext || null,
          name: file.name || res.originalFilename || 'attachment',
          size: file.size || res.bytes || 0,
          width: res.width || null,
          height: res.height || null,
          duration: res.duration || null,
        }
        if (res.dataUrl) {
          item.dataUrl = res.dataUrl
        }
        uploadedList.push(item)
      }
      setAttachments((prev) => [...prev, ...uploadedList])
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setUploading(false)
      setUploadPct(0)
    }
  }

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    await uploadFilesList(files)
  }

  const handlePaste = async (e) => {
    if (editingMessage || disabled || uploading) return
    const items = Array.from(e.clipboardData?.items || [])
    const pastedFiles = items
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean)

    if (pastedFiles.length > 0) {
      e.preventDefault()
      await uploadFilesList(pastedFiles)
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    if (editingMessage || disabled || uploading) return
    const droppedFiles = Array.from(e.dataTransfer?.files || [])
    if (droppedFiles.length > 0) {
      await uploadFilesList(droppedFiles)
    }
  }

  /* ---------------- Share Current Location ---------------- */
  const handleShareLocation = () => {
    if (disabled || locating || sending) return
    if (!navigator.geolocation) {
      message.error('Geolocation is not supported by your browser')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        let label = `${lat}, ${lng}`

        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`,
          )
          if (resp.ok) {
            const data = await resp.json()
            if (data?.display_name) {
              label = data.display_name.split(',').slice(0, 3).join(', ')
            }
          }
        } catch {
          // Fallback to coordinates label
        }

        try {
          await onSend?.({
            text: `📍 ${label}`,
            type: 'location',
            location: { lat, lng, label },
            attachments: [],
          })
          message.success('Location shared!')
        } catch (err) {
          message.error(getErrorMessage(err))
        } finally {
          setLocating(false)
        }
      },
      () => {
        setLocating(false)
        message.error('Location permission denied or unavailable')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  /* ---------------- Send Sticker or GIF ---------------- */
  const handleSendStickerOrGif = async (mediaUrl, kind = 'sticker', label = 'Sticker') => {
    if (disabled || sending) return
    setPickerOpen(false)
    setSending(true)
    try {
      await onSend?.({
        text: '',
        type: kind, // 'sticker' | 'gif'
        attachments: [
          {
            url: mediaUrl,
            type: kind,
            name: label,
          },
        ],
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  /* ---------------- Send Custom Quick Emoji ---------------- */
  const handleSendQuickEmoji = async () => {
    if (disabled || sending || uploading) return
    setSending(true)
    try {
      await onSend?.({
        text: quickEmoji,
        type: 'text',
        attachments: [],
      })
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  /* ---------------- Voice Note Recording + Live Waveform ---------------- */
  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      message.error('Voice recording is not supported in this browser')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recordDurationRef.current = 0
      recordedPeaksRef.current = []
      setRecordSecs(0)

      // Set up Web Audio Analyser for live waveform bars
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        if (AudioCtx) {
          const audioCtx = new AudioCtx()
          const source = audioCtx.createMediaStreamSource(stream)
          const analyser = audioCtx.createAnalyser()
          analyser.fftSize = 64
          source.connect(analyser)
          audioCtxRef.current = audioCtx

          const dataArr = new Uint8Array(analyser.frequencyBinCount)
          let lastSampleTime = 0

          const tick = (now) => {
            analyser.getByteFrequencyData(dataArr)
            if (now - lastSampleTime > 85) {
              lastSampleTime = now
              const bars = []
              for (let i = 0; i < 24; i += 1) {
                const v = dataArr[i % dataArr.length] / 255
                bars.push(Math.max(0.15, Math.min(1, v * 1.35)))
              }
              setLiveBars(bars)
              const avg =
                bars.reduce((acc, n) => acc + n, 0) / (bars.length || 1)
              recordedPeaksRef.current.push(Number(avg.toFixed(2)))
            }
            rafRef.current = requestAnimationFrame(tick)
          }
          rafRef.current = requestAnimationFrame(tick)
        }
      } catch {
        // Fallback if AudioContext fails
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)

      recordTimerRef.current = setInterval(() => {
        recordDurationRef.current += 1
        setRecordSecs(recordDurationRef.current)
      }, 1000)
    } catch {
      message.error('Microphone permission denied')
    }
  }

  const stopRecording = (shouldSend = false) => {
    const recorder = mediaRecorderRef.current
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    cleanupAudioAnalyser()

    if (!recorder) {
      setRecording(false)
      return
    }

    const duration = recordDurationRef.current
    const rawPeaks = recordedPeaksRef.current.slice()

    // Downsample or pad recordedPeaks into 28 clean bars for the message bubble
    const normalizedWaveform = Array.from({ length: 28 }, (_, idx) => {
      if (!rawPeaks.length) {
        return Number((0.25 + ((idx * 7) % 10) * 0.06).toFixed(2))
      }
      const mappedIdx = Math.floor((idx / 28) * rawPeaks.length)
      return Math.max(0.18, Math.min(1, rawPeaks[mappedIdx] || 0.3))
    })

    recorder.onstop = async () => {
      recorder.stream?.getTracks().forEach((t) => t.stop())
      setRecording(false)
      setRecordSecs(0)

      if (!shouldSend || chunksRef.current.length === 0) return

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      setUploading(true)
      setUploadPct(0)
      try {
        const res = await uploadVoiceNote(blob, { onProgress: setUploadPct })
        await onSend?.({
          text: '',
          type: 'voice',
          attachments: [
            {
              url: res.url,
              type: 'voice',
              name: 'Voice note',
              size: res.bytes || blob.size,
              duration: res.duration || duration || 1,
              waveform: normalizedWaveform,
            },
          ],
        })
      } catch (err) {
        message.error(getErrorMessage(err))
      } finally {
        setUploading(false)
        setUploadPct(0)
      }
    }

    if (recorder.state !== 'inactive') {
      recorder.stop()
    } else {
      setRecording(false)
    }
  }

  const handleSubmit = async () => {
    if (sending || uploading || disabled) return

    if (editingMessage) {
      if (!text.trim()) return
      setSending(true)
      try {
        await onSaveEdit?.(editingMessage.id, text.trim())
        setText('')
      } finally {
        setSending(false)
      }
      return
    }

    if (!text.trim() && attachments.length === 0) return

    setSending(true)
    try {
      let msgType = 'text'
      if (attachments.length > 0) {
        if (attachments.every((a) => a.type === 'image')) msgType = 'image'
        else if (attachments.every((a) => a.type === 'video')) msgType = 'video'
        else if (attachments.every((a) => a.type === 'audio')) msgType = 'voice'
        else msgType = 'file'
      }

      const clean = text.trim()
      const mentionedUids = extractMentionedUids(clean)

      await onSend?.({
        text: clean,
        type: msgType,
        attachments,
        mentions: mentionedUids,
      })
      setText('')
      setAttachments([])
      setTypingStatus(chatId, currentUid, false)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (editingMessage) {
        onClearEdit?.()
        setText('')
      } else if (replyTo) {
        onClearReply?.()
      }
      return
    }
    if ((e.key === 'Tab' || e.key === 'Enter') && mentionCandidates.length > 0) {
      e.preventDefault()
      handleInsertMention(mentionCandidates[0])
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="relative border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-2 sm:p-3 space-y-2"
    >
      {/* @Mention Autocomplete Popup (Group Chats) */}
      {mentionCandidates.length > 0 && (
        <div className="glass absolute inset-x-3 bottom-full z-30 mb-1.5 max-h-48 overflow-y-auto rounded-xl border border-[var(--color-border)] p-1.5 shadow-xl">
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            Mention Group Member
          </div>
          {mentionCandidates.map((m) => (
            <button
              key={m.uid}
              type="button"
              onClick={() => handleInsertMention(m)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-left text-xs text-foreground hover:bg-primary/15"
            >
              <Avatar size={24} src={m.photoURL} className="bg-primary text-[10px]">
                {getInitials(m.displayName)}
              </Avatar>
              <span className="font-semibold">{m.displayName}</span>
              <span className="text-muted">@{m.username}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply or Edit Banner */}
      {(replyTo || editingMessage) && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/15 px-3 py-1.5 text-xs">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              {editingMessage ? (
                <>
                  <EditOutlined /> Editing message
                </>
              ) : (
                <>
                  <UndoOutlined /> Replying to {replyTo.senderName}
                </>
              )}
            </div>
            <div className="truncate text-muted">
              {editingMessage ? editingMessage.text : replyTo.text || `(${replyTo.type})`}
            </div>
          </div>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => {
              if (editingMessage) {
                onClearEdit?.()
                setText('')
              } else {
                onClearReply?.()
              }
            }}
          />
        </div>
      )}

      {/* Pending Attachments Preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {attachments.map((att, idx) => {
            const isPdf =
              att.format === 'pdf' ||
              att.mimeType === 'application/pdf' ||
              /\.pdf$/i.test(att.name || '')
            return (
              <div
                key={idx}
                className="relative flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 pr-7 text-xs"
              >
                {att.type === 'image' ? (
                  <img
                    src={att.url}
                    alt={att.name}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : att.type === 'video' ? (
                  <VideoCameraOutlined className="text-base text-primary" />
                ) : isPdf ? (
                  <FilePdfOutlined className="text-base text-red-400" />
                ) : (
                  <PaperClipOutlined className="text-base text-primary" />
                )}
                <div className="min-w-0">
                  <div className="max-w-36 truncate font-medium">{att.name}</div>
                  {att.size > 0 && (
                    <div className="text-[10px] text-muted">{formatBytes(att.size)}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="absolute right-1.5 top-1.5 cursor-pointer border-0 bg-transparent p-0.5 text-muted hover:text-foreground"
                >
                  <CloseOutlined />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {uploading && <Progress percent={uploadPct} size="small" />}

      {/* Voice Recording Bar (with Live Waveform) or Text Input Bar */}
      {recording ? (
        <div className="flex items-center justify-between gap-2 sm:gap-3 rounded-xl bg-red-500/15 px-3 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs sm:text-sm font-medium text-red-400">
            <span className="h-2.5 w-2.5 shrink-0 animate-ping rounded-full bg-red-500" />
            <span className="shrink-0 tabular-nums">{formatDuration(recordSecs)}</span>

            {/* Live Audio Waveform Bars */}
            <div className="flex h-7 flex-1 items-center gap-0.5 overflow-hidden px-1">
              {liveBars.map((h, i) => (
                <span
                  key={i}
                  style={{ height: `${Math.round(h * 100)}%` }}
                  className="w-1 flex-1 rounded-full bg-red-400 transition-all duration-75"
                />
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => stopRecording(false)}
            >
              Cancel
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<SendOutlined />}
              onClick={() => stopRecording(true)}
            >
              Send
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-1 sm:gap-1.5">
          {!editingMessage && (
            <>
              {/* Hidden file inputs */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />

              {/* Mobile: Single compact '+' button for Image / File / Location / Poll */}
              <div className="sm:hidden">
                <Dropdown
                  trigger={['click']}
                  placement="topLeft"
                  disabled={disabled || uploading}
                  menu={{
                    items: [
                      {
                        key: 'image',
                        icon: <PictureOutlined />,
                        label: 'Send image',
                        onClick: () => imageInputRef.current?.click(),
                      },
                      {
                        key: 'file',
                        icon: <PaperClipOutlined />,
                        label: 'Attach file',
                        onClick: () => fileInputRef.current?.click(),
                      },
                      {
                        key: 'location',
                        icon: <EnvironmentOutlined />,
                        label: locating ? 'Sharing location...' : 'Share location',
                        onClick: handleShareLocation,
                      },
                      isGroup && {
                        key: 'poll',
                        icon: <BarChartOutlined />,
                        label: 'Create group poll',
                        onClick: onOpenPollModal,
                      },
                    ].filter(Boolean),
                  }}
                >
                  <Button
                    type="text"
                    icon={<PlusOutlined />}
                    disabled={disabled || uploading}
                    className="!px-2"
                  />
                </Dropdown>
              </div>

              {/* Tablet & Desktop: Individual action buttons */}
              <div className="hidden sm:flex items-center gap-0.5">
                <Tooltip title="Send image">
                  <Button
                    type="text"
                    icon={<PictureOutlined />}
                    disabled={disabled || uploading}
                    onClick={() => imageInputRef.current?.click()}
                  />
                </Tooltip>

                <Tooltip title="Attach file">
                  <Button
                    type="text"
                    icon={<PaperClipOutlined />}
                    disabled={disabled || uploading}
                    onClick={() => fileInputRef.current?.click()}
                  />
                </Tooltip>

                <Tooltip title="Share location">
                  <Button
                    type="text"
                    icon={<EnvironmentOutlined />}
                    loading={locating}
                    disabled={disabled || uploading}
                    onClick={handleShareLocation}
                  />
                </Tooltip>

                {isGroup && (
                  <Tooltip title="Create group poll">
                    <Button
                      type="text"
                      icon={<BarChartOutlined />}
                      disabled={disabled || uploading}
                      onClick={onOpenPollModal}
                    />
                  </Tooltip>
                )}
              </div>
            </>
          )}

          {/* Tabbed Emoji / Sticker / GIF Picker */}
          <Popover
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            trigger="click"
            placement="topLeft"
            content={
              <div className="w-72 space-y-2.5">
                <Segmented
                  block
                  size="small"
                  value={pickerTab}
                  onChange={setPickerTab}
                  options={[
                    { label: '😊 Emoji', value: 'emoji' },
                    { label: '✨ Stickers', value: 'stickers' },
                    { label: '🎞️ GIFs', value: 'gifs' },
                  ]}
                />

                {pickerTab === 'emoji' && (
                  <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto pr-0.5">
                    {EMOJI_PALETTE.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setText((prev) => `${prev}${emoji}`)}
                        className="cursor-pointer rounded border-0 bg-transparent p-1 text-lg hover:bg-primary/15"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {pickerTab === 'stickers' && (
                  <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto p-1">
                    {STICKER_PACK.map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        title={st.label}
                        onClick={() => handleSendStickerOrGif(st.url, 'sticker', st.label)}
                        className="flex cursor-pointer items-center justify-center rounded-lg border border-transparent bg-[var(--color-surface)] p-1.5 transition-transform hover:scale-110 hover:border-primary/40"
                      >
                        <img
                          src={st.url}
                          alt={st.label}
                          className="h-12 w-12 object-contain"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {pickerTab === 'gifs' && (
                  <div className="space-y-2">
                    <Input
                      size="small"
                      allowClear
                      prefix={<SearchOutlined className="text-muted" />}
                      placeholder="Search Tenor GIFs..."
                      value={gifQuery}
                      onChange={(e) => setGifQuery(e.target.value)}
                    />
                    {loadingGifs ? (
                      <div className="py-8 text-center">
                        <Spin size="small" />
                      </div>
                    ) : (
                      <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5">
                        {gifResults.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => handleSendStickerOrGif(g.url, 'gif', g.title)}
                            className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-black/20 p-0 cursor-pointer hover:opacity-90"
                          >
                            <img
                              src={g.url}
                              alt={g.title}
                              className="h-24 w-full object-cover"
                              loading="lazy"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            }
          >
            <Button
              type="text"
              icon={<SmileOutlined />}
              disabled={disabled}
              className="!px-1.5 sm:!px-2"
            />
          </Popover>

          <Input.TextArea
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={disabled}
            autoSize={{ minRows: 1, maxRows: 5 }}
            placeholder={
              disabled
                ? 'Messaging is unavailable'
                : editingMessage
                  ? 'Edit your message...'
                  : isGroup
                    ? 'Write a message... (@ to mention)'
                    : 'Write a message...'
            }
            className="min-w-0 flex-1"
          />

          {!editingMessage && !text.trim() && attachments.length === 0 ? (
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip title="Record voice note">
                <Button
                  type="default"
                  shape="circle"
                  icon={<AudioOutlined />}
                  disabled={disabled || uploading}
                  onClick={startRecording}
                />
              </Tooltip>
              <Tooltip title={`Send ${quickEmoji}`}>
                <Button
                  type="text"
                  shape="circle"
                  disabled={disabled || uploading || sending}
                  onClick={handleSendQuickEmoji}
                  className="!text-lg"
                >
                  {quickEmoji}
                </Button>
              </Tooltip>
            </div>
          ) : (
            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined />}
              loading={sending}
              disabled={disabled || uploading || (!text.trim() && attachments.length === 0)}
              className="shrink-0"
              onClick={handleSubmit}
            />
          )}
        </div>
      )}
    </div>
  )
}
