import { useEffect, useRef, useState } from 'react'
import { App, Avatar, Button, Form, Input, Modal, Progress } from 'antd'
import {
  CameraOutlined,
  DeleteOutlined,
  LinkOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { uploadImage } from '@/services/cloudinary'
import { updateUserProfile } from '@/features/profile/api/profileApi'
import { getErrorMessage } from '@/lib/firebaseErrors'
import { getInitials } from '@/lib/utils'

export default function EditProfileModal({ open, onClose, profile }) {
  const [form] = Form.useForm()
  const { message } = App.useApp()

  const [photoURL, setPhotoURL] = useState(profile?.photoURL || null)
  const [coverURL, setCoverURL] = useState(profile?.coverURL || null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [saving, setSaving] = useState(false)

  const avatarInputRef = useRef(null)
  const coverInputRef = useRef(null)

  useEffect(() => {
    if (open && profile) {
      setPhotoURL(profile.photoURL || null)
      setCoverURL(profile.coverURL || null)
      form.setFieldsValue({
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        birthday: profile.birthday || '',
        location: profile.location || '',
        links: Array.isArray(profile.links) && profile.links.length > 0 ? profile.links : [''],
      })
    }
  }, [open, profile, form])

  const handleImagePick = async (e, type) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const isAvatar = type === 'avatar'
    if (isAvatar) setUploadingAvatar(true)
    else setUploadingCover(true)
    setUploadPct(0)

    try {
      const res = await uploadImage(file, {
        folder: isAvatar ? 'chatly/avatars' : 'chatly/covers',
        onProgress: setUploadPct,
      })
      if (isAvatar) setPhotoURL(res.url)
      else setCoverURL(res.url)
      message.success(`${isAvatar ? 'Avatar' : 'Cover photo'} uploaded`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setUploadingAvatar(false)
      setUploadingCover(false)
      setUploadPct(0)
    }
  }

  const handleSave = async (values) => {
    if (!profile?.uid) return
    setSaving(true)
    try {
      const cleanLinks = (values.links || [])
        .map((l) => (l || '').trim())
        .filter(Boolean)
        .slice(0, 5)

      await updateUserProfile(profile.uid, {
        displayName: values.displayName.trim(),
        bio: (values.bio || '').trim(),
        birthday: (values.birthday || '').trim(),
        location: (values.location || '').trim(),
        links: cleanLinks,
        photoURL,
        coverURL,
      })
      message.success('Profile updated')
      onClose?.()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Edit profile"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Save changes"
      confirmLoading={saving || uploadingAvatar || uploadingCover}
      width={560}
      destroyOnClose
    >
      {/* Cover & Avatar Preview */}
      <div className="relative mb-12">
        <div
          className="relative h-36 w-full overflow-hidden rounded-lg bg-gradient-to-r from-primary/30 via-secondary/30 to-primary/20"
          style={
            coverURL
              ? { backgroundImage: `url(${coverURL})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        >
          <div className="absolute right-2 bottom-2 flex gap-1.5">
            <Button
              size="small"
              icon={<CameraOutlined />}
              loading={uploadingCover}
              onClick={() => coverInputRef.current?.click()}
            >
              Cover
            </Button>
            {coverURL && (
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => setCoverURL(null)}
              />
            )}
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImagePick(e, 'cover')}
          />
        </div>

        <div className="absolute -bottom-10 left-4 flex items-end gap-2">
          <div className="relative">
            <Avatar
              size={80}
              src={photoURL}
              className="border-4 border-[var(--color-surface)] bg-primary text-xl font-semibold shadow-lg"
            >
              {getInitials(profile?.displayName)}
            </Avatar>
            <Button
              size="small"
              shape="circle"
              type="primary"
              icon={<CameraOutlined />}
              loading={uploadingAvatar}
              className="!absolute right-0 bottom-0 shadow"
              onClick={() => avatarInputRef.current?.click()}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImagePick(e, 'avatar')}
            />
          </div>
          {photoURL && (
            <Button size="small" type="text" danger onClick={() => setPhotoURL(null)}>
              Remove photo
            </Button>
          )}
        </div>
      </div>

      {(uploadingAvatar || uploadingCover) && uploadPct > 0 && (
        <Progress percent={uploadPct} size="small" className="mb-3" />
      )}

      <Form form={form} layout="vertical" onFinish={handleSave} requiredMark={false}>
        <Form.Item
          name="displayName"
          label="Display name"
          rules={[{ required: true, whitespace: true, max: 50, message: 'Enter your display name (max 50 chars)' }]}
        >
          <Input maxLength={50} placeholder="Your display name" />
        </Form.Item>

        <Form.Item name="bio" label="Bio">
          <Input.TextArea rows={3} maxLength={240} showCount placeholder="Tell people a little about yourself..." />
        </Form.Item>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Form.Item name="location" label="Location">
            <Input maxLength={60} placeholder="City, Country" />
          </Form.Item>
          <Form.Item name="birthday" label="Birthday">
            <Input type="date" />
          </Form.Item>
        </div>

        <Form.List name="links">
          {(fields, { add, remove }) => (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Links (up to 5)</span>
                {fields.length < 5 && (
                  <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => add('')}>
                    Add link
                  </Button>
                )}
              </div>
              {fields.map((field) => (
                <div key={field.key} className="flex items-center gap-2">
                  <Form.Item {...field} noStyle>
                    <Input prefix={<LinkOutlined />} placeholder="https://example.com" />
                  </Form.Item>
                  {fields.length > 1 && (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Form.List>
      </Form>
    </Modal>
  )
}

