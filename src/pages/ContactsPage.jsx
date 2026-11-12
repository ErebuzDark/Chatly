import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  App,
  Avatar,
  Badge,
  Button,
  Empty,
  Input,
  Popconfirm,
  Skeleton,
  Tabs,
  Tag,
} from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  MessageOutlined,
  SearchOutlined,
  StopOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useContacts } from '@/features/contacts/hooks/useContacts'
import {
  acceptContactRequest,
  blockUser,
  cancelContactRequest,
  declineContactRequest,
  removeContact,
  searchUsersByPrefix,
  sendContactRequest,
  unblockUser,
} from '@/features/contacts/api/contactsApi'
import { getOrCreateDirectChat } from '@/features/chats/api/chatsApi'
import { getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function ContactsPage() {
  const { profile: currentUser } = useAuth()
  const { contacts, blocks, incomingRequests, outgoingRequests, loading } = useContacts()
  const { message } = App.useApp()
  const navigate = useNavigate()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const contactIds = useMemo(() => new Set(contacts.map((c) => c.uid)), [contacts])
  const blockedIds = useMemo(() => new Set(blocks.map((b) => b.uid)), [blocks])
  const outgoingMap = useMemo(
    () => new Map(outgoingRequests.map((r) => [r.toUid, r])),
    [outgoingRequests],
  )
  const incomingMap = useMemo(
    () => new Map(incomingRequests.map((r) => [r.fromUid, r])),
    [incomingRequests],
  )

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q || !currentUser?.uid) {
      setSearchResults([])
      setSearching(false)
      return undefined
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const res = await searchUsersByPrefix(q, currentUser.uid)
        setSearchResults(res)
      } catch (err) {
        message.error(getErrorMessage(err))
      } finally {
        setSearching(false)
      }
    }, 280)

    return () => clearTimeout(timer)
  }, [searchQuery, currentUser?.uid, message])

  const run = async (id, fn, okMsg) => {
    setBusyId(id)
    try {
      await fn()
      if (okMsg) message.success(okMsg)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const startChat = async (targetUser) => {
    if (!currentUser) return
    setBusyId(`chat_${targetUser.uid}`)
    try {
      const chat = await getOrCreateDirectChat(currentUser, targetUser)
      navigate(`/chats?chatId=${chat.id}`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="m-0 text-xl font-semibold">Contacts & People</h1>
          <p className="m-0 text-xs text-muted">
            Search by @username, manage contact requests, or start a conversation.
          </p>
        </div>
      </div>

      {/* Username Prefix Search */}
      <div className="glass rounded-lg p-4 space-y-4">
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined className="text-muted" />}
          placeholder="Search people by username prefix (e.g. alex)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        {searchQuery.trim() && (
          <div className="space-y-2 pt-1">
            <div className="text-xs font-medium text-muted uppercase tracking-wider">
              Search Results
            </div>
            {searching ? (
              <Skeleton avatar active paragraph={{ rows: 1 }} />
            ) : searchResults.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`No users matching "@${searchQuery.trim().replace(/^@/, '')}"`}
              />
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {searchResults.map((u) => {
                  const isContact = contactIds.has(u.uid)
                  const isBlocked = blockedIds.has(u.uid)
                  const outReq = outgoingMap.get(u.uid)
                  const inReq = incomingMap.get(u.uid)

                  return (
                    <div
                      key={u.uid}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <Link
                        to={`/u/${u.username}`}
                        className="flex items-center gap-3 text-inherit no-underline hover:opacity-90"
                      >
                        <Avatar size={44} src={u.photoURL} className="bg-primary">
                          {getInitials(u.displayName)}
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2 font-medium">
                            <span>{u.displayName}</span>
                            {isContact && <Tag color="green">Contact</Tag>}
                            {isBlocked && <Tag color="red">Blocked</Tag>}
                          </div>
                          <div className="text-xs text-muted">@{u.username}</div>
                        </div>
                      </Link>

                      <div className="flex items-center gap-2">
                        {isBlocked ? (
                          <Button
                            size="small"
                            onClick={() =>
                              run(
                                u.uid,
                                () => unblockUser(currentUser.uid, u.uid),
                                `Unblocked @${u.username}`,
                              )
                            }
                          >
                            Unblock
                          </Button>
                        ) : (
                          <>
                            {isContact ? (
                              <Button
                                size="small"
                                type="primary"
                                icon={<MessageOutlined />}
                                loading={busyId === `chat_${u.uid}`}
                                onClick={() => startChat(u)}
                              >
                                Message
                              </Button>
                            ) : outReq ? (
                              <Button
                                size="small"
                                loading={busyId === u.uid}
                                onClick={() =>
                                  run(
                                    u.uid,
                                    () => cancelContactRequest(currentUser.uid, u.uid),
                                    'Request cancelled',
                                  )
                                }
                              >
                                Cancel request
                              </Button>
                            ) : inReq ? (
                              <Button
                                size="small"
                                type="primary"
                                icon={<CheckOutlined />}
                                loading={busyId === u.uid}
                                onClick={() =>
                                  run(
                                    u.uid,
                                    () => acceptContactRequest(inReq),
                                    'Contact added!',
                                  )
                                }
                              >
                                Accept
                              </Button>
                            ) : (
                              <Button
                                size="small"
                                type="primary"
                                icon={<UserAddOutlined />}
                                loading={busyId === u.uid}
                                onClick={() =>
                                  run(
                                    u.uid,
                                    () => sendContactRequest(currentUser, u),
                                    'Contact request sent',
                                  )
                                }
                              >
                                Add
                              </Button>
                            )}

                            {!isContact && !u.isPrivate && (
                              <Button
                                size="small"
                                icon={<MessageOutlined />}
                                loading={busyId === `chat_${u.uid}`}
                                onClick={() => startChat(u)}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contacts, Requests & Blocked Tabs */}
      <Tabs
        defaultActiveKey="contacts"
        items={[
          {
            key: 'contacts',
            label: `My Contacts (${contacts.length})`,
            children: loading ? (
              <div className="glass rounded-lg p-4">
                <Skeleton avatar active paragraph={{ rows: 2 }} />
              </div>
            ) : contacts.length === 0 ? (
              <div className="glass rounded-lg p-8 text-center">
                <Empty description="No contacts yet. Search by username above to add friends!" />
              </div>
            ) : (
              <div className="glass divide-y divide-[var(--color-border)] rounded-lg px-4">
                {contacts.map((c) => (
                  <div
                    key={c.uid}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <Link
                      to={`/u/${c.username}`}
                      className="flex items-center gap-3 text-inherit no-underline hover:opacity-90"
                    >
                      <Avatar size={44} src={c.photoURL} className="bg-primary">
                        {getInitials(c.displayName)}
                      </Avatar>
                      <div>
                        <div className="font-medium">{c.displayName}</div>
                        <div className="text-xs text-muted">@{c.username}</div>
                      </div>
                    </Link>

                    <div className="flex items-center gap-2">
                      <Button
                        type="primary"
                        size="small"
                        icon={<MessageOutlined />}
                        loading={busyId === `chat_${c.uid}`}
                        onClick={() => startChat(c)}
                      >
                        Message
                      </Button>
                      <Popconfirm
                        title={`Remove @${c.username} from contacts?`}
                        onConfirm={() =>
                          run(
                            c.uid,
                            () => removeContact(currentUser.uid, c.uid),
                            'Contact removed',
                          )
                        }
                      >
                        <Button
                          size="small"
                          icon={<UserDeleteOutlined />}
                          loading={busyId === c.uid}
                        />
                      </Popconfirm>
                      <Popconfirm
                        title={`Block @${c.username}?`}
                        okText="Block"
                        okButtonProps={{ danger: true }}
                        onConfirm={() =>
                          run(
                            c.uid,
                            () => blockUser(currentUser, c),
                            `Blocked @${c.username}`,
                          )
                        }
                      >
                        <Button size="small" danger icon={<StopOutlined />} />
                      </Popconfirm>
                    </div>
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'requests',
            label: (
              <span className="flex items-center gap-2">
                <span>Requests</span>
                {incomingRequests.length > 0 && (
                  <Badge count={incomingRequests.length} size="small" />
                )}
              </span>
            ),
            children: (
              <div className="space-y-4">
                <div className="glass rounded-lg p-4 space-y-3">
                  <h3 className="m-0 text-sm font-semibold">
                    Incoming Requests ({incomingRequests.length})
                  </h3>
                  {incomingRequests.length === 0 ? (
                    <p className="m-0 text-xs text-muted">No incoming contact requests.</p>
                  ) : (
                    <div className="divide-y divide-[var(--color-border)]">
                      {incomingRequests.map((req) => {
                        const u = req.fromUser || {}
                        return (
                          <div
                            key={req.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                          >
                            <Link
                              to={`/u/${u.username}`}
                              className="flex items-center gap-3 text-inherit no-underline"
                            >
                              <Avatar size={40} src={u.photoURL} className="bg-primary">
                                {getInitials(u.displayName)}
                              </Avatar>
                              <div>
                                <div className="font-medium">{u.displayName}</div>
                                <div className="text-xs text-muted">@{u.username}</div>
                              </div>
                            </Link>
                            <div className="flex items-center gap-2">
                              <Button
                                type="primary"
                                size="small"
                                icon={<CheckOutlined />}
                                loading={busyId === req.id}
                                onClick={() =>
                                  run(
                                    req.id,
                                    () => acceptContactRequest(req),
                                    `Added @${u.username} to contacts`,
                                  )
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                size="small"
                                icon={<CloseOutlined />}
                                loading={busyId === req.id}
                                onClick={() =>
                                  run(
                                    req.id,
                                    () => declineContactRequest(req.fromUid, req.toUid),
                                    'Request declined',
                                  )
                                }
                              >
                                Decline
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="glass rounded-lg p-4 space-y-3">
                  <h3 className="m-0 text-sm font-semibold">
                    Sent Requests ({outgoingRequests.length})
                  </h3>
                  {outgoingRequests.length === 0 ? (
                    <p className="m-0 text-xs text-muted">No pending sent requests.</p>
                  ) : (
                    <div className="divide-y divide-[var(--color-border)]">
                      {outgoingRequests.map((req) => {
                        const u = req.toUser || {}
                        return (
                          <div
                            key={req.id}
                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                          >
                            <Link
                              to={`/u/${u.username}`}
                              className="flex items-center gap-3 text-inherit no-underline"
                            >
                              <Avatar size={40} src={u.photoURL} className="bg-primary">
                                {getInitials(u.displayName)}
                              </Avatar>
                              <div>
                                <div className="font-medium">{u.displayName}</div>
                                <div className="text-xs text-muted">@{u.username}</div>
                              </div>
                            </Link>
                            <Button
                              size="small"
                              icon={<CloseOutlined />}
                              loading={busyId === req.id}
                              onClick={() =>
                                run(
                                  req.id,
                                  () => cancelContactRequest(req.fromUid, req.toUid),
                                  'Request cancelled',
                                )
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: 'blocked',
            label: `Blocked (${blocks.length})`,
            children:
              blocks.length === 0 ? (
                <div className="glass rounded-lg p-8 text-center">
                  <Empty description="You haven't blocked anyone" />
                </div>
              ) : (
                <div className="glass divide-y divide-[var(--color-border)] rounded-lg px-4">
                  {blocks.map((b) => (
                    <div
                      key={b.uid}
                      className="flex items-center justify-between gap-3 py-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar size={40} src={b.photoURL} className="bg-primary">
                          {getInitials(b.displayName)}
                        </Avatar>
                        <div>
                          <div className="font-medium">{b.displayName}</div>
                          <div className="text-xs text-muted">@{b.username}</div>
                        </div>
                      </div>
                      <Button
                        size="small"
                        loading={busyId === b.uid}
                        onClick={() =>
                          run(
                            b.uid,
                            () => unblockUser(currentUser.uid, b.uid),
                            `Unblocked @${b.username}`,
                          )
                        }
                      >
                        Unblock
                      </Button>
                    </div>
                  ))}
                </div>
              ),
          },
        ]}
      />
    </div>
  )
}
