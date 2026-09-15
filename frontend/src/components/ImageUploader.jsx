import { useId, useRef, useState } from 'react'
import { ACCEPTED_EXTENSIONS, validateImageFile } from '../api'

/**
 * Drag-and-drop + click-to-browse image upload box.
 * Calls onFileSelected(file) with a validated File, or onError(message)
 * if validation fails.
 */
export default function ImageUploader({
  title = 'Drop your image here',
  onFileSelected,
  onError,
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = (files) => {
    const file = files && files[0]
    const error = validateImageFile(file)
    if (error) {
      onError?.(error)
      return
    }
    onFileSelected(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  return (
    <div
      className={`upload-box${isDragging ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${title}. Browse from your device.`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={handleKeyDown}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="upload-icon" aria-hidden="true">⬆</div>
      <h3>{title}</h3>
      <p>
        or <span className="browse">Browse from your device</span>
      </p>

      <div className="upload-meta">
        <span className="pill">JPG</span>
        <span className="pill">JPEG</span>
        <span className="pill">PNG</span>
        <span className="pill">WEBP</span>
        <span className="pill">Max 10 MB</span>
      </div>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
