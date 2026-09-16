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

// Free-tier hosts (e.g. Render's free plan) spin the backend down after a
// period of inactivity. The first request after that wakes it back up,
// which can take 30-60+ seconds — during that window the platform's own
// edge/proxy returns an error page with no CORS headers, which the browser
// reports as a generic network failure rather than a real HTTP status.
// We retry a few times with backoff so that a "cold start" is survived
// automatically instead of failing the user's very first request.
const COLD_START_RETRY_DELAYS_MS = [4000, 8000, 15000] // ~27s of retries
const REQUEST_TIMEOUT_MS = 45_000

async function postImage(fileOrBlob, filename) {
  const formData = new FormData()
  formData.append('file', fileOrBlob, filename)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(`${API_URL}/predict`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Sends an image (File or Blob) to the /predict endpoint and returns an
 * object URL for the denoised PNG result.
 *
 * Automatically retries through a backend "cold start" (see above).
 * `onStatus` is an optional callback(message) used to keep the UI informed
 * while a retry is in progress.
 *
 * Throws an Error with a user-friendly message on failure — never leaks
 * raw stack traces to the caller.
 */
export async function denoiseImage(fileOrBlob, filename = 'upload.png', onStatus) {
  let response
  let lastNetworkError = null

  for (let attempt = 0; attempt <= COLD_START_RETRY_DELAYS_MS.length; attempt++) {
    try {
      response = await postImage(fileOrBlob, filename)
      lastNetworkError = null
      break
    } catch (err) {
      lastNetworkError = err
      const isLastAttempt = attempt === COLD_START_RETRY_DELAYS_MS.length

      if (err.name === 'AbortError') {
        throw new Error('The request took too long to respond. Please try again.')
      }
      if (isLastAttempt) {
        break
      }
      onStatus?.('Waking up the AI server... this can take up to a minute on the first request.')
      await sleep(COLD_START_RETRY_DELAYS_MS[attempt])
    }
  }

  if (lastNetworkError) {
    throw new Error('Unable to connect to the AI server. Please try again in a moment.')
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
