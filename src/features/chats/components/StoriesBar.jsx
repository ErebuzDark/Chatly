import { useEffect, useMemo, useRef, useState } from 'react'
import {
  App,
  Avatar,
  Button,
  Input,
  Modal,
  Popover,
  Segmented,
  Tooltip,
} from 'antd'
import {
  CameraOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FontSizeOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useChats } from '@/features/chats/hooks/useChats'
import {
  getOrCreateDirectChat,
  sendMessage,
} from '@/features/chats/api/chatsApi'
import {
  addUserStory,
  deleteUserStory,
  getActiveStatusNote,
  getActiveStories,
  recordStoryView,
  updateUserStatusNote,
} from '@/features/profile/api/profileApi'
import { STORY_BACKGROUNDS } from '@/features/chats/constants/chatThemes'
import { uploadImage } from '@/services/cloudinary'
import { cn, formatRelativeTime, getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

const NOTE_EMOJIS = ['💭', '☕', '🔥', '💻', '🎧', '🎮', '📚', '😴', '✈️', '🥳', '🍕', '💪']
const STORY_REACTIONS = ['❤️', '🔥', '😂', '😮', '😢', '👏']
const STORY_DURATION_MS = 6000

export default function StoriesBar({ onSelectChat }) {
  const { profile } = useAuth()
  const { usersMap } = useChats()
  const { message } = App.useApp()
  const currentUid = profile?.uid

  // Note Modal state
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteEmoji, setNoteEmoji] = useState('💭')
  const [savingNote, setSavingNote] = useState(false)

  // Create Story Modal state
  const [createStoryOpen, setCreateStoryOpen] = useState(false)
  const [storyMode, setStoryMode] = useState('text') // 'text' | 'image'
  const [storyText, setStoryText] = useState('')
  const [storyBg, setStoryBg] = useState(STORY_BACKGROUNDS[0].css)
  const [storyImageUrl, setStoryImageUrl] = useState(null)
  const [storyCaption, setStoryCaption] = useState('')
  const [uploadingStoryImg, setUploadingStoryImg] = useState(false)
  const [publishingStory, setPublishingStory] = useState(false)
  const storyFileRef = useRef(null)

  // Story Viewer Modal state
  const [viewerOwner, setViewerOwner] = useState(null) // user object
  const [slideIdx, setSlideIdx] = useState(0)
  const [slideProgress, setSlideProgress] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const myLiveDoc = (currentUid && usersMap[currentUid]) || profile
  const myNote = getActiveStatusNote(myLiveDoc)
  const myStories = useMemo(() => getActiveStories(myLiveDoc), [myLiveDoc])

  // Collect all other known users who have active stories or an active status note
  const otherUsersWithActivity = useMemo(() => {
    if (!currentUid) return []
    const list = []
    for (const [uid, uDoc] of Object.entries(usersMap || {})) {
      if (uid === currentUid || !uDoc) continue
      const stories = getActiveStories(uDoc)
      const note = getActiveStatusNote(uDoc)
      if (stories.length > 0 || note) {
        const hasUnviewed = stories.some(
          (s) => !(s.viewerIds || []).includes(currentUid),
        )
        const latestTs = Math.max(
          stories[stories.length - 1]?.createdAt || 0,
          note?.createdAt || 0,
        )
        list.push({
          uid,
          displayName: uDoc.displayName || uDoc.username || 'User',
          username: uDoc.username || '',
          photoURL: uDoc.photoURL || null,
          stories,
          note,
          hasUnviewed,
          latestTs,
        })
      }
    }
    return list.sort((a, b) => {
      if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1
      return b.latestTs - a.latestTs
    })
  }, [usersMap, currentUid])

  // Keep viewerOwner synced with live updates (e.g., viewer count or story deletion)
  const activeViewerData = useMemo(() => {
    if (!viewerOwner) return null
    if (viewerOwner.uid === currentUid) {
      return {
        uid: currentUid,
        displayName: profile?.displayName || 'You',
        username: profile?.username || '',
        photoURL: profile?.photoURL || null,
        stories: myStories,
        note: myNote,
      }
    }
    const found = otherUsersWithActivity.find((u) => u.uid === viewerOwner.uid)
    if (found && found.stories.length > 0) return found
    return null
  }, [viewerOwner, currentUid, profile, myStories, myNote, otherUsersWithActivity])

  const currentStory = activeViewerData?.stories?.[slideIdx] || null

  // Record story view when viewing someone else's story slide
  useEffect(() => {
    if (!activeViewerData || !currentStory || !profile?.uid) return
    if (activeViewerData.uid !== profile.uid) {
      recordStoryView(activeViewerData.uid, currentStory.id, profile)
    }
  }, [activeViewerData, currentStory, profile])

  // Reset progress whenever switching to a different story slide
  useEffect(() => {
    setSlideProgress(0)
  }, [activeViewerData?.uid, currentStory?.id, slideIdx])

  // Animate progress bar & auto-advance story slides every 6 seconds (pauses while typing a reply)
  useEffect(() => {
    if (!activeViewerData || !currentStory || replyText.trim()) return undefined

    let lastTick = performance.now()
    const interval = setInterval(() => {
      const now = performance.now()
      const deltaPct = ((now - lastTick) / STORY_DURATION_MS) * 100
      lastTick = now

      setSlideProgress((prev) => {
        const next = prev + deltaPct
        if (next >= 100) {
          clearInterval(interval)
          if (slideIdx < activeViewerData.stories.length - 1) {
            setSlideIdx((i) => i + 1)
          } else {
            setViewerOwner(null)
            setSlideIdx(0)
          }
          return 100
        }
        return next
      })
    }, 30)

    return () => clearInterval(interval)
  }, [activeViewerData, currentStory, slideIdx, replyText])

  const openNoteModal = () => {
    setNoteText(myNote?.text || '')
    setNoteEmoji(myNote?.emoji || '💭')
    setNoteModalOpen(true)
  }

  const handleSaveNote = async () => {
    if (!currentUid) return
    setSavingNote(true)
    try {
      await updateUserStatusNote(currentUid, {
        text: noteText,
        emoji: noteText.trim() ? noteEmoji : '',
      })
      message.success(noteText.trim() ? 'Status note updated!' : 'Status note cleared')
      setNoteModalOpen(false)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSavingNote(false)
    }
  }

  const handleClearNote = async () => {
    if (!currentUid) return
    setSavingNote(true)
    try {
      await updateUserStatusNote(currentUid, { text: '', emoji: '' })
      setNoteText('')
      message.success('Status note removed')
      setNoteModalOpen(false)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSavingNote(false)
    }
  }

  const handleStoryFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadingStoryImg(true)
    try {
      const res = await uploadImage(file, { folder: 'chatly/stories' })
      setStoryImageUrl(res.url)
      setStoryMode('image')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setUploadingStoryImg(false)
    }
  }

  const handlePublishStory = async () => {
    if (!currentUid) return
    if (storyMode === 'text' && !storyText.trim()) {
      message.warning('Write something for your story')
      return
    }
    if (storyMode === 'image' && !storyImageUrl) {
      message.warning('Select a photo for your story')
      return
    }

    setPublishingStory(true)
    try {
      await addUserStory(currentUid, {
        type: storyMode,
        mediaURL: storyMode === 'image' ? storyImageUrl : null,
        text: storyMode === 'text' ? storyText : '',
        bgCss: storyMode === 'text' ? storyBg : null,
        caption: storyMode === 'image' ? storyCaption : '',
      })
      message.success('Added to your 24h Story!')
      setCreateStoryOpen(false)
      setStoryText('')
      setStoryImageUrl(null)
      setStoryCaption('')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setPublishingStory(false)
    }
  }

  const handleDeleteCurrentStory = async () => {
    if (!currentUid || !currentStory) return
    try {
      await deleteUserStory(currentUid, currentStory.id)
      message.success('Story deleted')
      if ((activeViewerData?.stories?.length || 0) <= 1) {
        setViewerOwner(null)
      } else {
        setSlideIdx((i) => Math.max(0, i - 1))
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleSendStoryReply = async (customText) => {
    const body = (customText ?? replyText).trim()
    if (!body || !activeViewerData || !profile || activeViewerData.uid === currentUid) return
    setSendingReply(true)
    try {
      const dm = await getOrCreateDirectChat(profile, {
        uid: activeViewerData.uid,
        displayName: activeViewerData.displayName,
        username: activeViewerData.username,
        photoURL: activeViewerData.photoURL,
      })
      const storyLabel =
        currentStory?.type === 'text'
          ? `"${(currentStory.text || '').slice(0, 40)}"`
          : 'their story'
      await sendMessage({
        chatId: dm.id,
        senderProfile: profile,
        text: `Replied to ${storyLabel}: ${body}`,
        type: 'text',
        memberIds: [profile.uid, activeViewerData.uid],
      })
      setReplyText('')
      message.success('Sent reply to story!')
      onSelectChat?.(dm.id)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSendingReply(false)
    }
  }

  return (
    <>
      <div className="flex items-end gap-3 overflow-x-auto border-b border-[var(--color-border)] px-3 py-2.5 scrollbar-none">
        {/* 1. Current User's Story & Custom Status Bubble */}
        <div className="relative flex w-16 shrink-0 flex-col items-center pt-5">
          {/* Floating Status Bubble ("Messenger Note") */}
          <button
            type="button"
            onClick={openNoteModal}
            title={myNote ? `${myNote.emoji || ''} ${myNote.text}` : 'Add a status note'}
            className="absolute top-0 z-10 max-w-20 cursor-pointer truncate rounded-full border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] font-medium text-foreground shadow-md transition-transform hover:scale-105"
          >
            {myNote ? (
              <span>
                {myNote.emoji} {myNote.text}
              </span>
            ) : (
              <span className="text-muted">+ Note</span>
            )}
          </button>

          <div className="relative">
            <div
              onClick={() => {
                if (myStories.length > 0) {
                  setSlideIdx(0)
                  setViewerOwner({ uid: currentUid })
                } else {
                  setCreateStoryOpen(true)
                }
              }}
              className={cn(
                'cursor-pointer rounded-full p-0.5 transition-transform hover:scale-105',
                myStories.length > 0
                  ? 'bg-gradient-to-tr from-primary via-purple-500 to-pink-500'
                  : 'border border-dashed border-[var(--color-border)]',
              )}
            >
              <Avatar
                size={46}
                src={profile?.photoURL}
                className="block border-2 border-[var(--color-surface)] bg-primary font-semibold"
              >
                {getInitials(profile?.displayName)}
              </Avatar>
            </div>

            <Tooltip title="Add to 24h Story">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setCreateStoryOpen(true)
                }}
                className="absolute -right-0.5 -bottom-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-primary text-[10px] text-white shadow"
              >
                <PlusOutlined />
              </button>
            </Tooltip>
          </div>

          <span className="mt-1 w-full truncate text-center text-[11px] text-muted">
            {myStories.length > 0 ? 'Your Story' : 'Add Story'}
          </span>
        </div>

        {/* 2. Other Users' Stories & Status Bubbles */}
        {otherUsersWithActivity.map((u) => (
          <div
            key={u.uid}
            className="relative flex w-16 shrink-0 flex-col items-center pt-5"
          >
            {u.note && (
              <Tooltip title={`${u.displayName}: ${u.note.emoji || ''} ${u.note.text}`}>
                <div
                  onClick={() => {
                    if (u.stories.length > 0) {
                      setSlideIdx(0)
                      setViewerOwner(u)
                    }
                  }}
                  className="absolute top-0 z-10 max-w-20 cursor-pointer truncate rounded-full border border-primary/30 bg-[var(--color-surface-raised)] px-2 py-0.5 text-[10px] font-medium text-foreground shadow-md"
                >
                  {u.note.emoji} {u.note.text}
                </div>
              </Tooltip>
            )}

            <div
              onClick={() => {
                if (u.stories.length > 0) {
                  setSlideIdx(0)
                  setViewerOwner(u)
                }
              }}
              className={cn(
                'rounded-full p-0.5 transition-transform',
                u.stories.length > 0 && 'cursor-pointer hover:scale-105',
                u.stories.length > 0
                  ? u.hasUnviewed
                    ? 'bg-gradient-to-tr from-primary via-purple-500 to-pink-500'
                    : 'bg-[var(--color-border)]'
                  : 'bg-transparent',
              )}
            >
              <Avatar
                size={46}
                src={u.photoURL}
                className="block border-2 border-[var(--color-surface)] bg-primary font-semibold"
              >
                {getInitials(u.displayName)}
              </Avatar>
            </div>

            <span className="mt-1 w-full truncate text-center text-[11px] font-medium">
              {u.displayName.split(' ')[0]}
            </span>
          </div>
        ))}
      </div>

      {/* Modal 1: Custom Status Bubble ("Messenger Note") */}
      <Modal
        title="Custom Status Bubble (24h Note)"
        open={noteModalOpen}
        onCancel={() => setNoteModalOpen(false)}
        footer={[
          myNote && (
            <Button
              key="clear"
              danger
              loading={savingNote}
              onClick={handleClearNote}
            >
              Clear Note
            </Button>
          ),
          <Button key="cancel" onClick={() => setNoteModalOpen(false)}>
            Cancel
          </Button>,
          <Button
            key="save"
            type="primary"
            loading={savingNote}
            onClick={handleSaveNote}
          >
            Share Note
          </Button>,
        ]}
      >
        <div className="space-y-4 py-2">
          <div className="flex flex-col items-center">
            <div className="mb-2 rounded-2xl border border-primary/40 bg-[var(--color-surface-raised)] px-3.5 py-1.5 text-sm font-medium shadow">
              {noteEmoji} {noteText.trim() || "What's on your mind?"}
            </div>
            <Avatar size={64} src={profile?.photoURL} className="bg-primary text-lg">
              {getInitials(profile?.displayName)}
            </Avatar>
          </div>

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">Pick a mood emoji</div>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setNoteEmoji(em)}
                  className={cn(
                    'cursor-pointer rounded-lg border px-2.5 py-1 text-lg transition-all',
                    noteEmoji === em
                      ? 'border-primary bg-primary/20 scale-110'
                      : 'border-[var(--color-border)] bg-transparent',
                  )}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <Input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            maxLength={60}
            showCount
            placeholder="Share a short thought (e.g. Studying 📚, In a meeting ☕)..."
            prefix={<EditOutlined className="text-muted" />}
          />
        </div>
      </Modal>

      {/* Modal 2: Create 24-Hour Story ("My Day") */}
      <Modal
        title="Add to Your 24-Hour Story"
        open={createStoryOpen}
        onCancel={() => setCreateStoryOpen(false)}
        okText="Share to Story"
        onOk={handlePublishStory}
        confirmLoading={publishingStory}
      >
        <div className="space-y-3 py-1">
          <Segmented
            block
            value={storyMode}
            onChange={setStoryMode}
            options={[
              { label: 'Text Story', value: 'text', icon: <FontSizeOutlined /> },
              { label: 'Photo Story', value: 'image', icon: <CameraOutlined /> },
            ]}
          />

          {storyMode === 'text' ? (
            <div className="space-y-3">
              <div
                style={{ background: storyBg }}
                className="flex h-64 w-full items-center justify-center rounded-xl p-6 text-center shadow-inner"
              >
                <Input.TextArea
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  maxLength={200}
                  autoSize={{ minRows: 2, maxRows: 5 }}
                  placeholder="Type your story status..."
                  className="!border-0 !bg-transparent text-center !text-xl font-bold !text-white placeholder:!text-white/60 focus:!shadow-none"
                />
              </div>

              <div className="flex items-center justify-center gap-2">
                {STORY_BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setStoryBg(bg.css)}
                    style={{ background: bg.css }}
                    className={cn(
                      'h-7 w-7 cursor-pointer rounded-full border-2 transition-transform',
                      storyBg === bg.css ? 'scale-115 border-white' : 'border-transparent',
                    )}
                    title={bg.label}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={storyFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleStoryFileChange}
              />

              {storyImageUrl ? (
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <img
                    src={storyImageUrl}
                    alt="Story preview"
                    className="max-h-72 w-full object-contain"
                  />
                  <Button
                    size="small"
                    shape="circle"
                    icon={<CloseOutlined />}
                    className="!absolute top-2 right-2"
                    onClick={() => setStoryImageUrl(null)}
                  />
                </div>
              ) : (
                <div
                  onClick={() => storyFileRef.current?.click()}
                  className="flex h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] hover:border-primary"
                >
                  <CameraOutlined className="text-3xl text-primary" />
                  <span className="text-xs text-muted">
                    {uploadingStoryImg ? 'Uploading photo...' : 'Click to choose a photo'}
                  </span>
                </div>
              )}

              <Input
                value={storyCaption}
                onChange={(e) => setStoryCaption(e.target.value)}
                maxLength={120}
                placeholder="Add a caption (optional)..."
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Modal 3: Full-Screen 24-Hour Story Viewer */}
      <Modal
        open={!!activeViewerData && !!currentStory}
        onCancel={() => {
          setViewerOwner(null)
          setSlideIdx(0)
        }}
        footer={null}
        closable={false}
        centered
        width={420}
        styles={{ body: { padding: 0 } }}
      >
        {activeViewerData && currentStory && (
          <div className="relative flex h-[78vh] max-h-[640px] flex-col justify-between overflow-hidden rounded-xl bg-[#0b0c10] text-white">
            {/* Top Progress Bars & Author Bar */}
            <div className="relative z-20 space-y-2.5 bg-gradient-to-b from-black/75 to-transparent p-3">
              <div className="flex gap-1">
                {activeViewerData.stories.map((st, idx) => {
                  const widthPct =
                    idx < slideIdx ? 100 : idx === slideIdx ? slideProgress : 0
                  return (
                    <div
                      key={st.id}
                      className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
                    >
                      <div
                        style={{ width: `${widthPct}%` }}
                        className="h-full bg-white transition-[width] duration-75 ease-linear"
                      />
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Avatar size={36} src={activeViewerData.photoURL} className="bg-primary">
                    {getInitials(activeViewerData.displayName)}
                  </Avatar>
                  <div>
                    <div className="text-sm font-semibold">
                      {activeViewerData.displayName}
                    </div>
                    <div className="text-[11px] text-white/70">
                      {formatRelativeTime(currentStory.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {activeViewerData.uid === currentUid && (
                    <>
                      <Tooltip title="Add another story">
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusOutlined />}
                          className="!text-white"
                          onClick={() => {
                            setViewerOwner(null)
                            setCreateStoryOpen(true)
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="Delete story">
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={handleDeleteCurrentStory}
                        />
                      </Tooltip>
                    </>
                  )}
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseOutlined />}
                    className="!text-white"
                    onClick={() => setViewerOwner(null)}
                  />
                </div>
              </div>
            </div>

            {/* Center Story Content */}
            <div
              style={
                currentStory.type === 'text'
                  ? { background: currentStory.bgCss || STORY_BACKGROUNDS[0].css }
                  : undefined
              }
              className="relative flex flex-1 items-center justify-center overflow-hidden px-8 text-center"
            >
              {currentStory.type === 'image' ? (
                <>
                  <img
                    src={currentStory.mediaURL}
                    alt="Story"
                    className="max-h-full max-w-full object-contain"
                  />
                  {currentStory.caption && (
                    <div className="absolute inset-x-4 bottom-4 rounded-lg bg-black/65 px-3 py-2 text-sm text-white backdrop-blur-sm">
                      {currentStory.caption}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-2xl font-bold leading-relaxed break-words text-white drop-shadow">
                  {currentStory.text}
                </div>
              )}

              {/* Prev / Next Navigation Buttons */}
              {slideIdx > 0 && (
                <button
                  type="button"
                  onClick={() => setSlideIdx((i) => i - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-black/45 text-white hover:bg-black/70"
                >
                  <LeftOutlined />
                </button>
              )}
              {slideIdx < activeViewerData.stories.length - 1 && (
                <button
                  type="button"
                  onClick={() => setSlideIdx((i) => i + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-black/45 text-white hover:bg-black/70"
                >
                  <RightOutlined />
                </button>
              )}
            </div>

            {/* Bottom Footer: Seen By (Owner) OR Quick Reactions & Reply (Viewer) */}
            <div className="relative z-20 bg-gradient-to-t from-black/85 to-transparent p-3">
              {activeViewerData.uid === currentUid ? (
                <div className="flex items-center justify-between text-xs">
                  <Popover
                    trigger="click"
                    placement="topLeft"
                    title={`Viewed by ${(currentStory.viewerIds || []).length}`}
                    content={
                      <div className="max-h-48 w-56 space-y-2 overflow-y-auto">
                        {(currentStory.viewerIds || []).length === 0 ? (
                          <div className="text-xs text-muted">No views yet</div>
                        ) : (
                          (currentStory.viewerIds || []).map((vUid) => {
                            const vInfo =
                              currentStory.viewers?.[vUid] ||
                              usersMap[vUid] || { displayName: 'Viewer' }
                            return (
                              <div key={vUid} className="flex items-center gap-2 text-xs">
                                <Avatar size={24} src={vInfo.photoURL} className="bg-primary">
                                  {getInitials(vInfo.displayName)}
                                </Avatar>
                                <span className="truncate font-medium">
                                  {vInfo.displayName}
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    }
                  >
                    <button
                      type="button"
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white"
                    >
                      <EyeOutlined /> Seen by {(currentStory.viewerIds || []).length}
                    </button>
                  </Popover>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-center gap-2">
                    {STORY_REACTIONS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleSendStoryReply(em)}
                        className="cursor-pointer rounded-full border-0 bg-white/15 px-2.5 py-1 text-base transition-transform hover:scale-125"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      size="small"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onPressEnter={() => handleSendStoryReply()}
                      placeholder={`Reply to ${activeViewerData.displayName}...`}
                    />
                    <Button
                      size="small"
                      type="primary"
                      icon={<SendOutlined />}
                      loading={sendingReply}
                      onClick={() => handleSendStoryReply()}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

