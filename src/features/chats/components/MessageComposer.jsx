import { useEffect, useRef, useState } from 'react'
import { App, Button, Input, Popover, Progress, Tooltip } from 'antd'
import {
  AudioOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  PaperClipOutlined,
  PictureOutlined,
  SendOutlined,
  SmileOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { uploadAttachment, uploadVoiceNote } from '@/services/cloudinary'
import { setTypingStatus } from '@/features/chats/api/chatsApi'
import { formatDuration } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

const EMOJI_PALETTE = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '🤩', '🥳', '🤔',
  '🙄', '😴', '😮', '😢', '😭', '😤', '🤯', '👍', '👎', '👏',
  '🙌', '🙏', '🤝', '💪', '❤️', '🔥', '✨', '🎉', '💯', '🚀',
  '👀', '💡', '✅', '⚡', '🌈', '☕', '🍕', '🎵', '🏆', '💎',
]

export default function MessageComposer({
  chatId,
  currentUid,
  replyTo,
  editingMessage,
  onClearReply,
  onClearEdit,
  onSend,
  onSaveEdit,
  disabled = false,
}) {
  const { message } = App.useApp()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState([]) // [{ url, type, name, size, width, height }]
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [sending, setSending] = useState(false)

  // Voice recording state
  const [recording, setRecording] = useState(false)
  const [recordSecs, setRecordSecs] = useState(0)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const recordDurationRef = useRef(0)

  const imageInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const lastTypingWriteRef = useRef(0)
  const typingTimeoutRef = useRef(null)

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || '')
    }
  }, [editingMessage])

  // Cleanup recording on unmount or chat switch
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [chatId])

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

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return

    setUploading(true)
    setUploadPct(0)

    try {
      const uploadedList = []
      for (const file of files.slice(0, 4)) {
        const res = await uploadAttachment(file, { onProgress: setUploadPct })
        uploadedList.push({
          url: res.url,
          type: file.type?.startsWith('image/') ? 'image' : 'file',
          name: file.name,
          size: file.size || res.bytes || 0,
          width: res.width || null,
          height: res.height || null,
        })
      }
      setAttachments((prev) => [...prev, ...uploadedList])
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setUploading(false)
      setUploadPct(0)
    }
  }

  /* ---------------- Voice Note Recording ---------------- */
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
      setRecordSecs(0)

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

    if (!recorder) {
      setRecording(false)
      return
    }

    const duration = recordDurationRef.current

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
        const allImages = attachments.every((a) => a.type === 'image')
        msgType = allImages ? 'image' : 'file'
      }

      await onSend?.({
        text: text.trim(),
        type: msgType,
        attachments,
      })
      setText('')
      setAttachments([])
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 space-y-2">
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
          {attachments.map((att, idx) => (
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
              ) : (
                <PaperClipOutlined className="text-base text-primary" />
              )}
              <span className="max-w-36 truncate">{att.name}</span>
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
          ))}
        </div>
      )}

      {uploading && <Progress percent={uploadPct} size="small" />}

      {/* Voice Recording Bar or Text Input Bar */}
      {recording ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-red-500/15 px-4 py-2">
          <div className="flex items-center gap-2.5 text-sm font-medium text-red-400">
            <span className="h-2.5 w-2.5 animate-ping rounded-full bg-red-500" />
            <span>Recording voice note... {formatDuration(recordSecs)}</span>
          </div>
          <div className="flex items-center gap-2">
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
        <div className="flex items-end gap-1.5">
          {!editingMessage && (
            <>
              <Tooltip title="Send image">
                <Button
                  type="text"
                  icon={<PictureOutlined />}
                  disabled={disabled || uploading}
                  onClick={() => imageInputRef.current?.click()}
                />
              </Tooltip>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />

              <Tooltip title="Attach file">
                <Button
                  type="text"
                  icon={<PaperClipOutlined />}
                  disabled={disabled || uploading}
                  onClick={() => fileInputRef.current?.click()}
                />
              </Tooltip>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />
            </>
          )}

          <Popover
            trigger="click"
            placement="topLeft"
            content={
              <div className="grid w-64 grid-cols-8 gap-1">
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
            }
          >
            <Button type="text" icon={<SmileOutlined />} disabled={disabled} />
          </Popover>

          <Input.TextArea
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            autoSize={{ minRows: 1, maxRows: 5 }}
            placeholder={
              disabled
                ? 'Messaging is unavailable'
                : editingMessage
                  ? 'Edit your message...'
                  : 'Write a message...'
            }
            className="flex-1"
          />

          {!editingMessage && !text.trim() && attachments.length === 0 ? (
            <Tooltip title="Record voice note">
              <Button
                type="default"
                shape="circle"
                icon={<AudioOutlined />}
                disabled={disabled || uploading}
                onClick={startRecording}
              />
            </Tooltip>
          ) : (
            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined />}
              loading={sending}
              disabled={disabled || uploading || (!text.trim() && attachments.length === 0)}
              onClick={handleSubmit}
            />
          )}
        </div>
      )}
    </div>
  )
}

