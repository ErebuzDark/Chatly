import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Avatar, Button, Empty, Popconfirm, Skeleton, Tag } from 'antd'
import {
  CalendarOutlined,
  CheckOutlined,
  CloseOutlined,
  EnvironmentOutlined,
  FlagOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  MessageOutlined,
  StopOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { getUserByUsername } from '@/features/profile/api/profileApi'
import {
  acceptContactRequest,
  blockUser,
  cancelContactRequest,
  declineContactRequest,
  getRelationshipState,
  removeContact,
  sendContactRequest,
  unblockUser,
} from '@/features/contacts/api/contactsApi'
import { getOrCreateDirectChat } from '@/features/chats/api/chatsApi'
import {
  DEFAULT_VISIBILITY,
  formatPresenceLabel,
  getInitials,
  isUserOnline,
} from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'
import ProfileWall from '@/features/profile/components/ProfileWall'
import ReportUserModal from '@/features/contacts/components/ReportUserModal'

export default function UserProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { profile: currentUser } = useAuth()
  const { message } = App.useApp()

  const [targetUser, setTargetUser] = useState(null)
  const [rel, setRel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const loadData = useCallback(async () => {
    if (!username || !currentUser?.uid) return
    setLoading(true)
    try {
      const found = await getUserByUsername(username)
      setTargetUser(found)
      if (found) {
        const relation = await getRelationshipState(currentUser.uid, found.uid)
        setRel(relation)
      }
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [username, currentUser?.uid, message])

  useEffect(() => {
    loadData()
  }, [loadData])

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Skeleton avatar active paragraph={{ rows: 4 }} />
      </div>
    )
  }

  if (!targetUser) {
    return (
      <div className="grid h-full min-h-80 place-items-center p-6">
        <Empty description={`User @${username} not found`} />
      </div>
    )
  }

  const isSelf = currentUser?.uid === targetUser.uid
  const isContact = !!rel?.isContact
  const isBlocked = !!rel?.iBlockedThem || !!rel?.theyBlockedMe

  // Privacy check: if account is private and viewer is neither owner nor contact, restrict view
  const isRestrictedPrivate = Boolean(targetUser.isPrivate && !isSelf && !isContact)
  const visibility = { ...DEFAULT_VISIBILITY, ...targetUser.visibility }
  const canSeePresence = !isRestrictedPrivate && !isBlocked
  const online = isUserOnline(targetUser, canSeePresence)
  const presenceLabel = formatPresenceLabel(targetUser, canSeePresence)

  const runAction = async (fn, okText) => {
    setActionBusy(true)
    try {
      await fn()
      if (okText) message.success(okText)
      await loadData()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setActionBusy(false)
    }
  }

  const handleStartChat = async () => {
    if (!currentUser || !targetUser) return
    if (isBlocked) {
      message.warning('Cannot message a blocked user.')
      return
    }
    setActionBusy(true)
    try {
      const chat = await getOrCreateDirectChat(currentUser, targetUser)
      navigate(`/chats?chatId=${chat.id}`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="glass overflow-hidden rounded-lg">
        <div
          className="h-36 sm:h-48 w-full bg-gradient-to-r from-primary/35 via-secondary/35 to-primary/20"
          style={
            !isRestrictedPrivate && targetUser.coverURL
              ? {
                  backgroundImage: `url(${targetUser.coverURL})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
        />

        <div className="px-5 pb-5">
          <div className="-mt-12 mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="relative">
              <Avatar
                size={96}
                src={targetUser.photoURL}
                className="border-4 border-[var(--color-surface)] bg-primary text-2xl font-semibold shadow-lg"
              >
                {getInitials(targetUser.displayName)}
              </Avatar>
              {online && (
                <span
                  title="Online"
                  className="absolute right-1.5 bottom-1.5 h-4 w-4 rounded-full border-2 border-[var(--color-surface)] bg-emerald-500"
                />
              )}
            </div>

            {/* Action Buttons */}
            {isSelf ? (
              <Button type="primary" onClick={() => navigate('/profile')}>
                Edit my profile
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {!rel?.iBlockedThem && !rel?.theyBlockedMe && (
                  <>
                    {isContact ? (
                      <Popconfirm
                        title="Remove from contacts?"
                        onConfirm={() =>
                          runAction(
                            () => removeContact(currentUser.uid, targetUser.uid),
                            'Removed from contacts',
                          )
                        }
                      >
                        <Button icon={<UserDeleteOutlined />} loading={actionBusy}>
                          Contacts
                        </Button>
                      </Popconfirm>
                    ) : rel?.outgoingRequest ? (
                      <Button
                        icon={<CloseOutlined />}
                        loading={actionBusy}
                        onClick={() =>
                          runAction(
                            () => cancelContactRequest(currentUser.uid, targetUser.uid),
                            'Request cancelled',
                          )
                        }
                      >
                        Cancel request
                      </Button>
                    ) : rel?.incomingRequest ? (
                      <>
                        <Button
                          type="primary"
                          icon={<CheckOutlined />}
                          loading={actionBusy}
                          onClick={() =>
                            runAction(
                              () => acceptContactRequest(rel.incomingRequest),
                              'Contact request accepted!',
                            )
                          }
                        >
                          Accept
                        </Button>
                        <Button
                          icon={<CloseOutlined />}
                          loading={actionBusy}
                          onClick={() =>
                            runAction(
                              () => declineContactRequest(targetUser.uid, currentUser.uid),
                              'Request declined',
                            )
                          }
                        >
                          Decline
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        loading={actionBusy}
                        onClick={() =>
                          runAction(
                            () => sendContactRequest(currentUser, targetUser),
                            'Contact request sent',
                          )
                        }
                      >
                        Add
                      </Button>
                    )}

                    {(!isRestrictedPrivate || isContact) && (
                      <Button
                        type={isContact ? 'primary' : 'default'}
                        icon={<MessageOutlined />}
                        loading={actionBusy}
                        onClick={handleStartChat}
                      >
                        Message
                      </Button>
                    )}
                  </>
                )}

                {rel?.iBlockedThem ? (
                  <Button
                    danger
                    onClick={() =>
                      runAction(
                        () => unblockUser(currentUser.uid, targetUser.uid),
                        `Unblocked @${targetUser.username}`,
                      )
                    }
                  >
                    Unblock
                  </Button>
                ) : (
                  <Popconfirm
                    title={`Block @${targetUser.username}?`}
                    description="They won't be able to message you or add you as a contact."
                    okText="Block"
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      runAction(
                        () => blockUser(currentUser, targetUser),
                        `Blocked @${targetUser.username}`,
                      )
                    }
                  >
                    <Button icon={<StopOutlined />} danger />
                  </Popconfirm>
                )}

                <Button
                  icon={<FlagOutlined />}
                  title="Report user"
                  onClick={() => setReportOpen(true)}
                />
              </div>
            )}
          </div>

          {/* Profile Info */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-2xl font-bold">{targetUser.displayName}</h1>
              {targetUser.isPrivate && (
                <Tag icon={<LockOutlined />} color="blue">
                  Private
                </Tag>
              )}
              {isContact && <Tag color="green">Contact</Tag>}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>@{targetUser.username}</span>
              {presenceLabel && (
                <span className={online ? 'text-emerald-400 font-medium' : ''}>
                  • {presenceLabel}
                </span>
              )}
            </div>

            {isRestrictedPrivate ? (
              <div className="mt-4 rounded-lg border border-dashed p-6 text-center">
                <LockOutlined className="mb-2 text-2xl text-muted" />
                <div className="font-semibold">This account is private</div>
                <p className="m-0 mt-1 text-xs text-muted">
                  Add @{targetUser.username} as a contact to see their bio, details, and wall posts.
                </p>
              </div>
            ) : (
              <>
                {targetUser.bio && (
                  <p className="m-0 pt-1 whitespace-pre-wrap text-sm leading-relaxed">
                    {targetUser.bio}
                  </p>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-2 text-xs text-muted">
                  {(isSelf || visibility.email) && targetUser.email && (
                    <span className="flex items-center gap-1.5">
                      <MailOutlined /> {targetUser.email}
                    </span>
                  )}
                  {(isSelf || visibility.location) && targetUser.location && (
                    <span className="flex items-center gap-1.5">
                      <EnvironmentOutlined /> {targetUser.location}
                    </span>
                  )}
                  {(isSelf || visibility.birthday) && targetUser.birthday && (
                    <span className="flex items-center gap-1.5">
                      <CalendarOutlined /> Born {targetUser.birthday}
                    </span>
                  )}
                </div>

                {(isSelf || visibility.links) &&
                  Array.isArray(targetUser.links) &&
                  targetUser.links.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-1 text-xs">
                      {targetUser.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.startsWith('http') ? link : `https://${link}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <LinkOutlined />
                          {link.replace(/^https?:\/\//, '')}
                        </a>
                      ))}
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Wall Posts (hidden if restricted private or blocked) */}
      {!isRestrictedPrivate && !isBlocked && (
        <div>
          <h2 className="mb-3 text-base font-semibold">Wall</h2>
          <ProfileWall
            profileOwner={targetUser}
            currentUserUid={currentUser?.uid}
            canPost={isSelf}
          />
        </div>
      )}

      <ReportUserModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        reporterUid={currentUser?.uid}
        targetUser={targetUser}
      />
    </div>
  )
}

