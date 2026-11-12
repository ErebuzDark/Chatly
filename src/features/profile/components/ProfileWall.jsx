import { useCallback, useEffect, useRef, useState } from 'react'
import { App, Avatar, Button, Empty, Image, Input, Popconfirm, Progress, Skeleton } from 'antd'
import {
  DeleteOutlined,
  HeartFilled,
  HeartOutlined,
  PictureOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  createWallPost,
  deleteWallPost,
  getWallPosts,
  toggleLikeWallPost,
} from '@/features/profile/api/profileApi'
import { uploadImage } from '@/services/cloudinary'
import { formatRelativeTime, getInitials } from '@/lib/utils'
import { getErrorMessage } from '@/lib/firebaseErrors'

export default function ProfileWall({ profileOwner, currentUserUid, canPost = false }) {
  const { message } = App.useApp()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [mediaURL, setMediaURL] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [posting, setPosting] = useState(false)
  const fileRef = useRef(null)

  const loadPosts = useCallback(async () => {
    if (!profileOwner?.uid) return
    setLoading(true)
    try {
      const list = await getWallPosts(profileOwner.uid)
      setPosts(list)
    } catch {
      // May fail if private or not allowed
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [profileOwner?.uid])

  useEffect(() => {
    loadPosts()
  }, [loadPosts])

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setUploadPct(0)
    try {
      const uploaded = await uploadImage(file, {
        folder: 'chatly/wall',
        onProgress: setUploadPct,
      })
      setMediaURL(uploaded.url)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setUploading(false)
      setUploadPct(0)
    }
  }

  const handleCreatePost = async () => {
    if ((!text.trim() && !mediaURL) || !profileOwner?.uid) return
    setPosting(true)
    try {
      await createWallPost(profileOwner.uid, {
        text,
        mediaURL,
        mediaType: mediaURL ? 'image' : null,
      })
      setText('')
      setMediaURL(null)
      await loadPosts()
      message.success('Posted to your wall')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async (postId) => {
    try {
      await deleteWallPost(profileOwner.uid, postId)
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      message.success('Post deleted')
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleToggleLike = async (post) => {
    if (!currentUserUid) return
    const liked = Array.isArray(post.likes) && post.likes.includes(currentUserUid)
    // Optimistic UI update
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== post.id) return p
        const nextLikes = liked
          ? (p.likes || []).filter((id) => id !== currentUserUid)
          : [...(p.likes || []), currentUserUid]
        return { ...p, likes: nextLikes }
      }),
    )
    try {
      await toggleLikeWallPost(profileOwner.uid, post.id, currentUserUid, liked)
    } catch {
      loadPosts()
    }
  }

  return (
    <div className="space-y-4">
      {canPost && (
        <div className="glass rounded-lg p-4 space-y-3">
          <Input.TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Share a status update or photo on your wall..."
            autoSize={{ minRows: 2, maxRows: 5 }}
            maxLength={600}
          />
          {uploading && <Progress percent={uploadPct} size="small" />}
          {mediaURL && (
            <div className="relative inline-block">
              <img
                src={mediaURL}
                alt="Preview"
                className="max-h-48 rounded-md border object-cover"
              />
              <Button
                size="small"
                danger
                shape="circle"
                icon={<DeleteOutlined />}
                className="!absolute top-1.5 right-1.5"
                onClick={() => setMediaURL(null)}
              />
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <div>
              <Button
                size="small"
                icon={<PictureOutlined />}
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                Photo
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
            </div>
            <Button
              type="primary"
              size="small"
              icon={<SendOutlined />}
              loading={posting}
              disabled={(!text.trim() && !mediaURL) || uploading}
              onClick={handleCreatePost}
            >
              Post
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass rounded-lg p-4">
          <Skeleton active avatar paragraph={{ rows: 2 }} />
        </div>
      ) : posts.length === 0 ? (
        <div className="glass rounded-lg p-8 text-center">
          <Empty description="No wall posts yet" />
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const liked = Array.isArray(post.likes) && post.likes.includes(currentUserUid)
            const likeCount = Array.isArray(post.likes) ? post.likes.length : 0

            return (
              <div key={post.id} className="glass rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Avatar src={profileOwner?.photoURL} className="bg-primary">
                      {getInitials(profileOwner?.displayName)}
                    </Avatar>
                    <div>
                      <div className="text-sm font-semibold">{profileOwner?.displayName}</div>
                      <div className="text-xs text-muted">
                        @{profileOwner?.username} · {formatRelativeTime(post.createdAt)}
                      </div>
                    </div>
                  </div>
                  {canPost && (
                    <Popconfirm
                      title="Delete this post?"
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => handleDelete(post.id)}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  )}
                </div>

                {post.text && (
                  <p className="m-0 whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {post.text}
                  </p>
                )}

                {post.mediaURL && (
                  <div className="overflow-hidden rounded-md">
                    <Image
                      src={post.mediaURL}
                      alt="Wall attachment"
                      className="max-h-96 w-auto rounded-md object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center gap-3 pt-1">
                  <Button
                    type="text"
                    size="small"
                    icon={liked ? <HeartFilled className="text-red-500" /> : <HeartOutlined />}
                    onClick={() => handleToggleLike(post)}
                  >
                    {likeCount > 0 ? likeCount : 'Like'}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

