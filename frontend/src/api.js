// Central place for all backend API calls. The backend base URL comes from
// an environment variable so it is never hardcoded across the app.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
export const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
export const ACCEPTED_EXTENSIONS = '.jpg,.jpeg,.png,.webp'

export function validateImageFile(file) {
  if (!file) {
    return 'Please choose a file to upload.'
  }
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'Please upload a valid image (JPG, PNG, or WEBP).'
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'Image size must be below 10 MB.'
  }
  return null
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Sends an image (File or Blob) to the /predict endpoint and returns an
 * object URL for the denoised PNG result.
 *
 * Throws an Error with a user-friendly message on failure — never leaks
 * raw stack traces to the caller.
 */
export async function denoiseImage(fileOrBlob, filename = 'upload.png') {
  const formData = new FormData()
  formData.append('file', fileOrBlob, filename)

  let response
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60_000)

    response = await fetch(`${API_URL}/predict`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('The request took too long to respond. Please try again.')
    }
    throw new Error('Unable to connect to the AI server. Please try again.')
  }

  if (!response.ok) {
    let detail = 'Something went wrong while processing the image.'
    try {
      const data = await response.json()
      if (data && data.detail) detail = data.detail
    } catch {
      // response wasn't JSON — fall back to the generic message
    }
    throw new Error(detail)
  }

  let blob
  try {
    blob = await response.blob()
    if (!blob || blob.size === 0 || !blob.type.startsWith('image/')) {
      throw new Error('invalid')
    }
  } catch {
    throw new Error('Received an invalid response from the server.')
  }

  return URL.createObjectURL(blob)
}
