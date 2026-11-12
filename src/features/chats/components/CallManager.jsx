import { useEffect, useMemo, useRef, useState } from 'react'
import { App, Avatar, Button, Modal, Tag } from 'antd'
import {
  CloseOutlined,
  CompressOutlined,
  ExpandOutlined,
  PhoneFilled,
  PhoneOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useChats } from '@/features/chats/hooks/useChats'
import {
  declineChatCall,
  joinChatCall,
  leaveOrEndChatCall,
} from '@/features/chats/api/chatsApi'
import { getChatDisplay } from '@/features/chats/components/ChatSidebar'
import { startRingtone } from '@/services/sound'
import { DEFAULT_SETTINGS, getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

const JITSI_DOMAIN = 'meet.jit.si'

let jitsiScriptPromise = null
function loadJitsiScript() {
  if (typeof window === 'undefined') return Promise.reject()
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI)
  if (jitsiScriptPromise) return jitsiScriptPromise

  jitsiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://${JITSI_DOMAIN}/external_api.js`
    script.async = true
    script.onload = () => resolve(window.JitsiMeetExternalAPI)
    script.onerror = (err) => {
      jitsiScriptPromise = null
      reject(err)
    }
    document.body.appendChild(script)
  })
  return jitsiScriptPromise
}

function JitsiRoomView({ activeCall, userProfile, onHangup }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const onHangupRef = useRef(onHangup)
  const [useFallbackIframe, setUseFallbackIframe] = useState(false)

  useEffect(() => {
    onHangupRef.current = onHangup
  }, [onHangup])

  const roomName = activeCall?.roomName || 'ChatlyDefaultRoom'
  const isAudioOnly = activeCall?.callType === 'audio'
  const displayName = userProfile?.displayName || userProfile?.username || 'Chatly User'

  useEffect(() => {
    let cancelled = false

    loadJitsiScript()
      .then((JitsiMeetExternalAPI) => {
        if (cancelled || !containerRef.current || !JitsiMeetExternalAPI) return

        // Clear container before mounting
        containerRef.current.innerHTML = ''

        const api = new JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: {
            displayName,
            email: userProfile?.email || undefined,
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            startWithAudioMuted: false,
            startWithVideoMuted: isAudioOnly,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
          },
        })

        apiRef.current = api

        if (userProfile?.photoURL) {
          try {
            api.executeCommand('avatarUrl', userProfile.photoURL)
          } catch {
            // ignore
          }
        }

        const handleClose = () => {
          onHangupRef.current?.()
        }

        api.addEventListener('readyToClose', handleClose)
        api.addEventListener('videoConferenceLeft', handleClose)
      })
      .catch(() => {
        if (!cancelled) setUseFallbackIframe(true)
      })

    return () => {
      cancelled = true
      if (apiRef.current) {
        try {
          apiRef.current.dispose()
        } catch {
          // ignore
        }
        apiRef.current = null
      }
    }
  }, [roomName, isAudioOnly, displayName, userProfile?.email, userProfile?.photoURL])

  const fallbackUrl = `https://${JITSI_DOMAIN}/${encodeURIComponent(
    roomName,
  )}#config.prejoinPageEnabled=false&config.startWithVideoMuted=${isAudioOnly}&userInfo.displayName="${encodeURIComponent(
    displayName,
  )}"`

  if (useFallbackIframe) {
    return (
      <iframe
        src={fallbackUrl}
        title="Jitsi Call"
        className="h-full w-full border-0"
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
      />
    )
  }

  return <div ref={containerRef} className="h-full w-full bg-black" />
}

export default function CallManager() {
  const { profile, user } = useAuth()
  const { chats, openCallChatId, setOpenCallChatId } = useChats()
  const { message } = App.useApp()
  const uid = profile?.uid || user?.uid

  const [minimized, setMinimized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dismissedCallIds, setDismissedCallIds] = useState({})

  // Active call that the current user is currently viewing/joined
  const currentCallChat = useMemo(() => {
    if (!openCallChatId) return null
    const found = chats.find((c) => c.id === openCallChatId)
    return found?.activeCall ? found : null
  }, [chats, openCallChatId])

  // Auto-close window if the remote party ended the call
  useEffect(() => {
    if (openCallChatId && !currentCallChat) {
      setOpenCallChatId(null)
      setMinimized(false)
    }
  }, [openCallChatId, currentCallChat, setOpenCallChatId])

  // Find any incoming ringing call for this user across all non-muted chats
  const incomingCallChat = useMemo(() => {
    if (!uid || currentCallChat) return null
    const now = Date.now()

    return (
      chats.find((c) => {
        const call = c.activeCall
        if (!call || !call.callId) return false
        if (dismissedCallIds[call.callId]) return false
        if (call.callerId === uid) return false
        if ((call.participants || []).includes(uid)) return false
        if ((call.declinedBy || []).includes(uid)) return false
        // Only ring for fresh calls (started within the last 3 minutes)
        if (call.startedAt && now - call.startedAt > 3 * 60 * 1000) return false
        return true
      }) || null
    )
  }, [chats, uid, currentCallChat, dismissedCallIds])

  // Play looping ringtone while an incoming call is ringing (or while caller is waiting in ringing status)
  const isWaitingForAnswer =
    currentCallChat?.activeCall?.status === 'ringing' &&
    (currentCallChat?.activeCall?.participants || []).length <= 1

  useEffect(() => {
    const shouldRing = Boolean(incomingCallChat || isWaitingForAnswer)
    if (!shouldRing) return undefined

    const settings = { ...DEFAULT_SETTINGS, ...profile?.settings }
    if (settings.soundEnabled === false) return undefined

    const stop = startRingtone()
    return () => stop()
  }, [incomingCallChat, isWaitingForAnswer, profile?.settings])

  const handleAcceptIncoming = async () => {
    if (!incomingCallChat || !uid) return
    setBusy(true)
    try {
      await joinChatCall(incomingCallChat.id, uid)
      setMinimized(false)
      setOpenCallChatId(incomingCallChat.id)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDeclineIncoming = async () => {
    if (!incomingCallChat || !uid) return
    const callId = incomingCallChat.activeCall?.callId
    if (callId) {
      setDismissedCallIds((prev) => ({ ...prev, [callId]: true }))
    }
    try {
      await declineChatCall(
        incomingCallChat,
        uid,
        profile?.displayName || 'User',
      )
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleLeaveOrEndCall = async (forceEnd = false) => {
    const targetChat = currentCallChat
    setOpenCallChatId(null)
    setMinimized(false)
    if (!targetChat || !uid) return
    try {
      await leaveOrEndChatCall(
        targetChat,
        uid,
        profile?.displayName || 'User',
        forceEnd,
      )
    } catch {
      // ignore
    }
  }

  const incomingCall = incomingCallChat?.activeCall
  const activeCall = currentCallChat?.activeCall
  const { title: activeChatTitle } = getChatDisplay(currentCallChat, uid)

  return (
    <>
      {/* 1. Incoming Call Ringing Modal */}
      <Modal
        open={!!incomingCall && !currentCallChat}
        closable={false}
        maskClosable={false}
        footer={null}
        width={360}
        centered
      >
        {incomingCall && (
          <div className="flex flex-col items-center py-4 text-center space-y-4">
            <div className="relative">
              <span className="absolute -inset-2 animate-ping rounded-full bg-emerald-500/30" />
              <Avatar
                size={84}
                src={incomingCall.callerPhoto || undefined}
                className="relative bg-primary text-2xl font-bold shadow-lg"
              >
                {getInitials(incomingCall.callerName)}
              </Avatar>
            </div>

            <div>
              <Tag color={incomingCall.callType === 'audio' ? 'blue' : 'purple'} className="mb-1.5">
                {incomingCall.callType === 'audio'
                  ? 'Incoming Voice Call'
                  : 'Incoming Video Call'}
              </Tag>
              <h3 className="m-0 text-lg font-bold">{incomingCall.callerName}</h3>
              {incomingCall.isGroup && incomingCall.chatTitle && (
                <p className="m-0 mt-0.5 text-xs text-muted">
                  in {incomingCall.chatTitle}
                </p>
              )}
            </div>

            <div className="flex w-full items-center justify-center gap-6 pt-2">
              <div className="flex flex-col items-center gap-1">
                <Button
                  danger
                  type="primary"
                  shape="circle"
                  size="large"
                  icon={<CloseOutlined />}
                  className="!h-13 !w-13"
                  onClick={handleDeclineIncoming}
                />
                <span className="text-xs text-muted">Decline</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <Button
                  type="primary"
                  shape="circle"
                  size="large"
                  loading={busy}
                  icon={
                    incomingCall.callType === 'audio' ? (
                      <PhoneFilled />
                    ) : (
                      <VideoCameraOutlined />
                    )
                  }
                  style={{ backgroundColor: '#10b981' }}
                  className="!h-13 !w-13"
                  onClick={handleAcceptIncoming}
                />
                <span className="text-xs font-medium text-emerald-400">Accept</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 2. Active Call Window (Full Modal or Minimized Floating Bar) */}
      {currentCallChat && activeCall && (
        <div
          className={
            minimized
              ? 'fixed right-4 bottom-20 md:bottom-5 z-50 w-80 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-overlay)] shadow-2xl backdrop-blur-xl'
              : 'fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-md p-0 md:p-4'
          }
        >
          {/* Call Header Bar */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#14151a] px-4 py-2.5 text-white md:rounded-t-xl">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {activeChatTitle}
                </div>
                <div className="text-[11px] text-white/65">
                  {activeCall.callType === 'audio' ? 'Voice Call' : 'Video Call'} •{' '}
                  {(activeCall.participants || []).length}{' '}
                  {(activeCall.participants || []).length === 1
                    ? 'participant'
                    : 'participants'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                size="small"
                type="text"
                className="!text-white"
                icon={minimized ? <ExpandOutlined /> : <CompressOutlined />}
                title={minimized ? 'Expand call' : 'Minimize to corner'}
                onClick={() => setMinimized((m) => !m)}
              />
              <Button
                size="small"
                danger
                type="primary"
                icon={<PhoneOutlined />}
                onClick={() => handleLeaveOrEndCall(false)}
              >
                {currentCallChat.type === 'group' ? 'Leave' : 'End Call'}
              </Button>
            </div>
          </div>

          {/* Jitsi Room Container (stays mounted even when minimized so audio continues) */}
          <div
            className={
              minimized
                ? 'h-44 w-full overflow-hidden'
                : 'min-h-0 flex-1 w-full overflow-hidden md:rounded-b-xl'
            }
          >
            <JitsiRoomView
              activeCall={activeCall}
              userProfile={profile}
              onHangup={() => handleLeaveOrEndCall(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}

