import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  App,
  Avatar,
  Button,
  Checkbox,
  Drawer,
  Dropdown,
  Empty,
  Image,
  Input,
  Modal,
  Popconfirm,
  Switch,
  Tag,
} from 'antd'
import {
  CameraOutlined,
  CopyOutlined,
  CrownOutlined,
  DeleteOutlined,
  EditOutlined,
  FlagOutlined,
  LogoutOutlined,
  MoreOutlined,
  PictureOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import {
  addMembersToGroup,
  regenerateGroupInvite,
  removeGroupMember,
  setGroupMemberRole,
  toggleChatFlag,
  toggleGroupInvite,
  updateChatBackground,
  updateGroupDetails,
} from '@/features/chats/api/chatsApi'
import {
  blockUser,
  searchUsersByPrefix,
  unblockUser,
} from '@/features/contacts/api/contactsApi'
import { uploadImage } from '@/services/cloudinary'
import { getChatDisplay } from '@/features/chats/components/ChatSidebar'
import { getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'
import ReportUserModal from '@/features/contacts/components/ReportUserModal'

export default function ChatInfoDrawer({
  open,
  onClose,
  chat,
  otherUserDoc = null,
  messages = [],
  currentUser,
  contacts = [],
  blocks = [],
}) {
  const { message } = App.useApp()
  const [editingGroup, setEditingGroup] = useState(false)
  const [groupTitle, setGroupTitle] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchingUsers, setSearchingUsers] = useState(false)
  const [selectedUsersMap, setSelectedUsersMap] = useState({})
  const [busy, setBusy] = useState(false)
  const [bgUploading, setBgUploading] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const avatarInputRef = useRef(null)
  const bgInputRef = useRef(null)

  useEffect(() => {
    if (!addMemberOpen) {
      setMemberSearch('')
      setSearchResults([])
      setSelectedUsersMap({})
      return undefined
    }
    const q = memberSearch.trim()
    if (!q || !currentUser?.uid) {
      setSearchResults([])
      setSearchingUsers(false)
      return undefined
    }
    setSearchingUsers(true)
    const timer = setTimeout(async () => {
      try {
        const res = await searchUsersByPrefix(q, currentUser.uid)
        setSearchResults(res)
      } catch {
        // ignore
      } finally {
        setSearchingUsers(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [memberSearch, addMemberOpen, currentUser?.uid])

  if (!chat || !currentUser) return null

  const isGroup = chat.type === 'group'
  const {
    title: rawTitle,
    avatar: rawAvatar,
    otherUid,
    username: rawUsername,
  } = getChatDisplay(chat, currentUser.uid)
  const title = !isGroup && otherUserDoc?.displayName ? otherUserDoc.displayName : rawTitle
  const avatar = !isGroup && otherUserDoc !== null ? otherUserDoc.photoURL : rawAvatar
  const username = !isGroup && otherUserDoc?.username ? otherUserDoc.username : rawUsername
  const myRole = chat.roles?.[currentUser.uid] || 'member'
  const isAdmin = isGroup && myRole === 'admin'

  const isPinned = Array.isArray(chat.pinnedBy) && chat.pinnedBy.includes(currentUser.uid)
  const isMuted = Array.isArray(chat.mutedBy) && chat.mutedBy.includes(currentUser.uid)
  const isArchived =
    Array.isArray(chat.archivedBy) && chat.archivedBy.includes(currentUser.uid)

  const isBlocked = !isGroup && blocks.some((b) => b.uid === otherUid)
  const otherProfile = !isGroup
    ? {
        uid: otherUid,
        username,
        displayName: title,
        photoURL: avatar,
      }
    : null

  // Shared images from currently loaded messages
  const sharedImages = messages
    .filter((m) => !m.deletedForAll)
    .flatMap((m) => (m.attachments || []).filter((a) => a.type?.startsWith('image')))

  const startEditGroup = () => {
    setGroupTitle(chat.title || '')
    setGroupDesc(chat.description || '')
    setEditingGroup(true)
  }

  const handleSaveGroup = async () => {
    if (!groupTitle.trim()) return
    setBusy(true)
    try {
      await updateGroupDetails(chat.id, {
        title: groupTitle,
        description: groupDesc,
      })
      setEditingGroup(false)
      message.success('Group details updated')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleGroupAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const res = await uploadImage(file, { folder: 'chatly/groups' })
      await updateGroupDetails(chat.id, { avatarURL: res.url })
      message.success('Group photo updated')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      message.warning('Please select an image file')
      return
    }
    setBgUploading(true)
    try {
      const res = await uploadImage(file, { folder: 'chatly/backgrounds' })
      await updateChatBackground(chat.id, res.url, currentUser)
      message.success('Chat background updated!')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBgUploading(false)
    }
  }

  const handleRemoveBackground = async () => {
    setBgUploading(true)
    try {
      await updateChatBackground(chat.id, null, currentUser)
      message.success('Chat background removed')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBgUploading(false)
    }
  }

  const copyInviteLink = () => {
    if (!chat.inviteCode) return
    const link = `${window.location.origin}/join/${chat.inviteCode}`
    navigator.clipboard.writeText(link)
    message.success('Invite link copied!')
  }

  const nonMemberContacts = contacts.filter(
    (c) => !(chat.memberIds || []).includes(c.uid),
  )

  const candidateUsers = (memberSearch.trim() ? searchResults : nonMemberContacts).filter(
    (u) => !(chat.memberIds || []).includes(u.uid),
  )

  const toggleSelectCandidate = (userObj) => {
    setSelectedUsersMap((prev) => {
      const next = { ...prev }
      if (next[userObj.uid]) delete next[userObj.uid]
      else next[userObj.uid] = userObj
      return next
    })
  }

  const handleAddMembers = async () => {
    const chosen = Object.values(selectedUsersMap)
    if (!chosen.length) return
    setBusy(true)
    try {
      await addMembersToGroup(chat.id, chosen, currentUser)
      setSelectedUsersMap({})
      setAddMemberOpen(false)
      message.success(
        `Added ${chosen.map((c) => c.displayName).join(', ')} to the group`,
      )
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      title={isGroup ? 'Group Info' : 'Conversation Info'}
      open={open}
      onClose={onClose}
      width="min(360px, 100vw)"
    >
      <div className="space-y-6">
        {/* Header Summary */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-2">
            <Avatar
              size={80}
              src={avatar}
              icon={isGroup && !avatar ? <TeamOutlined /> : undefined}
              className="bg-primary text-xl font-semibold"
            >
              {!isGroup && getInitials(title)}
            </Avatar>
            {isAdmin && (
              <>
                <Button
                  size="small"
                  shape="circle"
                  type="primary"
                  icon={<CameraOutlined />}
                  loading={busy}
                  className="!absolute right-0 bottom-0"
                  onClick={() => avatarInputRef.current?.click()}
                />
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleGroupAvatar}
                />
              </>
            )}
          </div>

          {editingGroup ? (
            <div className="w-full space-y-2 pt-2 text-left">
              <Input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                placeholder="Group name"
                maxLength={60}
              />
              <Input.TextArea
                rows={2}
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                placeholder="Description"
                maxLength={200}
              />
              <div className="flex justify-end gap-2">
                <Button size="small" onClick={() => setEditingGroup(false)}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  type="primary"
                  loading={busy}
                  onClick={handleSaveGroup}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <h3 className="m-0 text-lg font-bold">{title}</h3>
                {isAdmin && (
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={startEditGroup}
                  />
                )}
              </div>
              {isGroup ? (
                <>
                  <p className="m-0 text-xs text-muted">
                    {(chat.memberIds || []).length} members
                  </p>
                  {chat.description && (
                    <p className="m-0 mt-2 text-xs text-muted">{chat.description}</p>
                  )}
                </>
              ) : (
                <>
                  {username && <p className="m-0 text-xs text-muted">@{username}</p>}
                  {username && (
                    <Link to={`/u/${username}`} className="mt-2">
                      <Button size="small" icon={<UserOutlined />}>
                        View Profile
                      </Button>
                    </Link>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Chat Toggles (Pin, Mute, Archive) */}
        <div className="space-y-3 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between text-sm">
            <span>Pin conversation</span>
            <Switch
              size="small"
              checked={isPinned}
              onChange={(v) => toggleChatFlag(chat.id, currentUser.uid, 'pinnedBy', v)}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Mute notifications</span>
            <Switch
              size="small"
              checked={isMuted}
              onChange={(v) => toggleChatFlag(chat.id, currentUser.uid, 'mutedBy', v)}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>Archive chat</span>
            <Switch
              size="small"
              checked={isArchived}
              onChange={(v) => toggleChatFlag(chat.id, currentUser.uid, 'archivedBy', v)}
            />
          </div>
        </div>

        {/* Custom Chat Background (Image Only) */}
        <div className="space-y-2.5 border-t border-[var(--color-border)] pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Chat Background
            </span>
          </div>

          {chat.backgroundURL && (
            <div className="relative overflow-hidden rounded-lg border border-[var(--color-border)]">
              <img
                src={chat.backgroundURL}
                alt="Chat background"
                className="h-28 w-full object-cover"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="small"
              icon={<PictureOutlined />}
              loading={bgUploading}
              onClick={() => bgInputRef.current?.click()}
              className="flex-1"
            >
              {chat.backgroundURL ? 'Change image' : 'Upload background image'}
            </Button>
            {chat.backgroundURL && (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                loading={bgUploading}
                onClick={handleRemoveBackground}
              >
                Remove
              </Button>
            )}
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBackgroundUpload}
            />
          </div>
        </div>

        {/* Group Invite Link & Members */}
        {isGroup && (
          <>
            <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Invite Link
                </span>
                {isAdmin && (
                  <Switch
                    size="small"
                    checked={chat.inviteEnabled !== false}
                    onChange={(v) => toggleGroupInvite(chat.id, v)}
                  />
                )}
              </div>

              {chat.inviteEnabled !== false && chat.inviteCode ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    size="small"
                    readOnly
                    value={`${window.location.origin}/join/${chat.inviteCode}`}
                  />
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={copyInviteLink}
                  />
                  {isAdmin && (
                    <Button
                      size="small"
                      title="Reset link"
                      icon={<ReloadOutlined />}
                      onClick={() => regenerateGroupInvite(chat.id, true)}
                    />
                  )}
                </div>
              ) : (
                <p className="m-0 text-xs text-muted">Invite link is disabled.</p>
              )}
            </div>

            {/* Members List & Add Member Button */}
            <div className="space-y-2.5 border-t border-[var(--color-border)] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Members ({(chat.memberIds || []).length})
                </span>
                <Button
                  size="small"
                  type="primary"
                  icon={<UserAddOutlined />}
                  onClick={() => setAddMemberOpen(true)}
                >
                  Add member
                </Button>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {(chat.memberIds || []).map((uid) => {
                  const info = chat.memberInfo?.[uid] || {
                    uid,
                    displayName: 'Member',
                    username: '',
                  }
                  const role = chat.roles?.[uid] || 'member'
                  const isMe = uid === currentUser.uid

                  const memberMenu =
                    isAdmin && !isMe
                      ? [
                          {
                            key: 'role',
                            icon: <CrownOutlined />,
                            label:
                              role === 'admin' ? 'Dismiss as admin' : 'Make group admin',
                            onClick: () =>
                              setGroupMemberRole(
                                chat.id,
                                uid,
                                role === 'admin' ? 'member' : 'admin',
                              ),
                          },
                          {
                            key: 'kick',
                            icon: <DeleteOutlined />,
                            danger: true,
                            label: 'Remove from group',
                            onClick: () =>
                              removeGroupMember(
                                chat.id,
                                { uid, displayName: info.displayName || 'Member' },
                                currentUser,
                              ),
                          },
                        ]
                      : []

                  return (
                    <div
                      key={uid}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar size={32} src={info.photoURL} className="bg-primary text-xs">
                          {getInitials(info.displayName)}
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                            <span className="truncate">{info.displayName}</span>
                            {isMe && <span className="text-xs text-muted">(You)</span>}
                            {role === 'admin' && (
                              <Tag color="gold" className="!m-0 !text-[10px]">
                                Admin
                              </Tag>
                            )}
                          </div>
                          {info.username && (
                            <div className="text-xs text-muted">@{info.username}</div>
                          )}
                        </div>
                      </div>

                      {memberMenu.length > 0 && (
                        <Dropdown menu={{ items: memberMenu }} trigger={['click']}>
                          <Button type="text" size="small" icon={<MoreOutlined />} />
                        </Dropdown>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* Shared Media */}
        {sharedImages.length > 0 && (
          <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Shared Photos ({sharedImages.length})
            </span>
            <Image.PreviewGroup>
              <div className="grid grid-cols-3 gap-1.5">
                {sharedImages.slice(0, 9).map((img, i) => (
                  <Image
                    key={i}
                    src={img.url}
                    alt="Shared"
                    className="h-20 w-full rounded object-cover"
                  />
                ))}
              </div>
            </Image.PreviewGroup>
          </div>
        )}

        {/* Danger Zone (Leave Group or Block/Report User) */}
        <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
          {isGroup ? (
            <Popconfirm
              title="Leave this group?"
              okText="Leave"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                await removeGroupMember(chat.id, currentUser, currentUser)
                onClose?.()
              }}
            >
              <Button danger block icon={<LogoutOutlined />}>
                Leave Group
              </Button>
            </Popconfirm>
          ) : (
            <div className="flex flex-col gap-2">
              {isBlocked ? (
                <Button
                  block
                  onClick={() => unblockUser(currentUser.uid, otherUid)}
                >
                  Unblock @{username || title}
                </Button>
              ) : (
                <Popconfirm
                  title={`Block @${username || title}?`}
                  okText="Block"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => blockUser(currentUser, otherProfile)}
                >
                  <Button danger block icon={<StopOutlined />}>
                    Block User
                  </Button>
                </Popconfirm>
              )}

              <Button
                block
                icon={<FlagOutlined />}
                onClick={() => setReportOpen(true)}
              >
                Report User
              </Button>
            </div>
          )}
        </div>
      </div>

      {!isGroup && otherProfile && (
        <ReportUserModal
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reporterUid={currentUser.uid}
          targetUser={otherProfile}
        />
      )}

      {isGroup && (
        <Modal
          title="Add Members to Group"
          open={addMemberOpen}
          onCancel={() => setAddMemberOpen(false)}
          onOk={handleAddMembers}
          okText={`Add (${Object.keys(selectedUsersMap).length})`}
          okButtonProps={{
            disabled: Object.keys(selectedUsersMap).length === 0,
            loading: busy,
          }}
          destroyOnClose
        >
          <div className="space-y-3">
            <Input
              allowClear
              prefix={<SearchOutlined className="text-muted" />}
              placeholder="Search people by @username or pick from contacts..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />

            {Object.keys(selectedUsersMap).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.values(selectedUsersMap).map((u) => (
                  <Tag
                    key={u.uid}
                    closable
                    color="blue"
                    onClose={() => toggleSelectCandidate(u)}
                  >
                    {u.displayName} (@{u.username})
                  </Tag>
                ))}
              </div>
            )}

            <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)] px-3">
              {candidateUsers.length === 0 ? (
                <div className="py-6">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      searchingUsers
                        ? 'Searching users...'
                        : memberSearch.trim()
                          ? 'No matching users outside this group'
                          : 'No contacts outside this group — search by @username above!'
                    }
                  />
                </div>
              ) : (
                candidateUsers.map((u) => {
                  const checked = !!selectedUsersMap[u.uid]
                  return (
                    <label
                      key={u.uid}
                      className="flex cursor-pointer items-center justify-between gap-3 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar size={36} src={u.photoURL} className="bg-primary shrink-0">
                          {getInitials(u.displayName)}
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{u.displayName}</div>
                          <div className="truncate text-xs text-muted">@{u.username}</div>
                        </div>
                      </div>
                      <Checkbox
                        checked={checked}
                        onChange={() => toggleSelectCandidate(u)}
                      />
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </Modal>
      )}
    </Drawer>
  )
}

