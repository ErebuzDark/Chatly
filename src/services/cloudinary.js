const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET

const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB

export function isCloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET)
}

/**
 * Upload an image, voice note (audio/video), or generic file to Cloudinary
 * using an unsigned upload preset (Spark free-tier friendly).
 *
 * @param {File|Blob} file
 * @param {Object} options
 * @param {'image'|'video'|'raw'|'auto'} [options.resourceType='auto']
 * @param {string} [options.folder='chatly']
 * @param {(percent: number) => void} [options.onProgress]
 * @returns {Promise<{ url: string, publicId: string, resourceType: string, format: string, bytes: number, width?: number, height?: number, duration?: number, originalFilename: string }>}
 */
export function uploadToCloudinary(
  file,
  { resourceType = 'auto', folder = 'chatly', onProgress } = {},
) {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      reject(new Error('Cloudinary is not configured. Check VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env'))
      return
    }

    const maxBytes = resourceType === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
    if (file.size > maxBytes) {
      const limitMB = Math.round(maxBytes / (1024 * 1024))
      reject(new Error(`File is too large. Maximum allowed size is ${limitMB} MB.`))
      return
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', UPLOAD_PRESET)
    if (folder) formData.append('folder', folder)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint)

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100))
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText)
          resolve({
            url: data.secure_url,
            publicId: data.public_id,
            resourceType: data.resource_type,
            format: data.format,
            bytes: data.bytes,
            width: data.width,
            height: data.height,
            duration: data.duration,
            originalFilename: file.name || data.original_filename || 'attachment',
          })
        } catch {
          reject(new Error('Invalid response from Cloudinary'))
        }
      } else {
        let errMsg = 'Upload failed'
        try {
          const errData = JSON.parse(xhr.responseText)
          if (errData?.error?.message) errMsg = errData.error.message
        } catch {
          // ignore
        }
        reject(new Error(errMsg))
      }
    }

    xhr.onerror = () => reject(new Error('Network error while uploading file'))
    xhr.send(formData)
  })
}

export const uploadImage = (file, opts = {}) =>
  uploadToCloudinary(file, { ...opts, resourceType: 'image' })

// Cloudinary handles audio files (webm/mp3/ogg/wav) under the "video" resource_type
export const uploadVoiceNote = (blob, opts = {}) => {
  const file = blob instanceof File ? blob : new File([blob], `voice-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
  return uploadToCloudinary(file, { ...opts, resourceType: 'video', folder: 'chatly/voice' })
}

export const uploadAttachment = (file, opts = {}) => {
  if (file.type?.startsWith('image/')) {
    return uploadImage(file, { ...opts, folder: 'chatly/images' })
  }
  if (file.type?.startsWith('audio/') || file.type?.startsWith('video/')) {
    return uploadToCloudinary(file, { ...opts, resourceType: 'video', folder: 'chatly/media' })
  }
  return uploadToCloudinary(file, { ...opts, resourceType: 'auto', folder: 'chatly/files' })
}

