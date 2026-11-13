import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { App, Avatar, Button, Empty, Skeleton } from 'antd'
import { TeamOutlined } from '@ant-design/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useChats } from '@/features/chats/hooks/useChats'
import {
  findGroupByInviteCode,
  joinGroupByInviteCode,
} from '@/features/chats/api/chatsApi'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function JoinGroupPage() {
  const { inviteCode } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { chats, selectChat } = useChats()
  const { message } = App.useApp()

  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true)
      try {
        const raw = decodeURIComponent((inviteCode || '').trim())
        const codePart = (raw.includes('--') ? raw.split('--').pop() : raw)
          .trim()
          .toLowerCase()

        // Fast-path: check if this group is already in the user's loaded chats
        const localMatch = chats.find(
          (c) =>
            c.type === 'group' &&
            c.inviteEnabled !== false &&
            (c.inviteCode || '').toLowerCase() === codePart,
        )
        if (localMatch) {
          if (active) {
            setGroup(localMatch)
            setLoading(false)
          }
          return
        }

        const found = await findGroupByInviteCode(inviteCode)
        if (active) setGroup(found)
      } catch {
        if (active) setGroup(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [inviteCode, chats])

  const handleJoin = async () => {
    if (!profile) return
    setJoining(true)
    try {
      const chatId = await joinGroupByInviteCode(inviteCode, profile)
      message.success(`Joined ${group?.title || 'group'}!`)
      selectChat(chatId)
      navigate(`/chats?chatId=${chatId}`, { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setJoining(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Skeleton active avatar paragraph={{ rows: 3 }} />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="grid h-full min-h-80 place-items-center p-6">
        <Empty description="This invite link is invalid or has been disabled." />
      </div>
    )
  }

  const alreadyMember = (group.memberIds || []).includes(profile?.uid)

  return (
    <div className="grid h-full min-h-80 place-items-center p-6">
      <div className="glass w-full max-w-md space-y-4 rounded-xl p-6 text-center">
        <Avatar
          size={80}
          src={group.avatarURL}
          icon={!group.avatarURL ? <TeamOutlined /> : undefined}
          className="mx-auto bg-primary"
        />
        <div>
          <h1 className="m-0 text-xl font-bold">{group.title}</h1>
          <p className="m-0 mt-1 text-xs text-muted">
            {(group.memberIds || []).length} members
          </p>
          {group.description && (
            <p className="m-0 mt-3 text-sm text-muted">{group.description}</p>
          )}
        </div>

        <Button
          type="primary"
          size="large"
          block
          loading={joining}
          onClick={() => {
            if (alreadyMember) {
              selectChat(group.id)
              navigate(`/chats?chatId=${group.id}`)
            } else {
              handleJoin()
            }
          }}
        >
          {alreadyMember ? 'Open Group Chat' : 'Join Group'}
        </Button>
      </div>
    </div>
  )
}

