import { useEffect, useRef, useState } from 'react'
import ImageUploader from './ImageUploader'
import LoadingSpinner from './LoadingSpinner'
import ComparisonSlider from './ComparisonSlider'
import { denoiseImage, formatFileSize } from '../api'

export default function DenoiseSection() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [dimensions, setDimensions] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [status, setStatus] = useState('idle') // idle | processing | done
  const [error, setError] = useState(null)

  const previewUrlRef = useRef(null)
  const resultUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    }
  }, [])

  const resetResult = () => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = null
    }
    setResultUrl(null)
    setStatus('idle')
  }

  const handleFileSelected = (selectedFile) => {
    setError(null)
    resetResult()

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }

    const url = URL.createObjectURL(selectedFile)
    previewUrlRef.current = url
    setPreviewUrl(url)
    setFile(selectedFile)

    const img = new Image()
    img.onload = () => setDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    img.src = url
  }

  const handleDenoise = async () => {
    if (!file) return
    setError(null)
    setStatus('processing')
    try {
      const url = await denoiseImage(file, file.name)
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = url
      setResultUrl(url)
      setStatus('done')
    } catch (err) {
      setError(err.message || 'Something went wrong while processing the image.')
      setStatus('idle')
    }
  }

  const handleDownload = () => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = 'denoised-image.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <section id="denoise" className="section">
      <div className="app-shell">
        <div className="section-header fade-in">
          <span className="eyebrow">Core Feature</span>
          <h2 className="section-heading">AI Image Denoising</h2>
          <p className="section-sub">
            Upload your image and our trained CNN model will process it and
            reduce visible image noise.
          </p>
        </div>

        {error && (
          <div className="error-banner fade-in" role="alert" style={{ marginBottom: 24 }}>
            ⚠ {error}
          </div>
        )}

        {!file && (
          <ImageUploader
            title="Drop your image here"
            onFileSelected={handleFileSelected}
            onError={setError}
          />
        )}

        {file && (
          <div className="card preview-card fade-in">
            <div className="preview-thumb">
              <img src={previewUrl} alt="Uploaded preview" />
            </div>
            <div className="preview-info">
              <span className="pill">Original Image</span>
              <h4>{file.name}</h4>
              <dl>
                <dt>Dimensions</dt>
                <dd>{dimensions ? `${dimensions.width} × ${dimensions.height}px` : '—'}</dd>
                <dt>File size</dt>
                <dd>{formatFileSize(file.size)}</dd>
                <dt>Format</dt>
                <dd>{file.type.replace('image/', '').toUpperCase()}</dd>
              </dl>

              <div className="action-row">
                <button
                  className="btn btn-primary"
                  onClick={handleDenoise}
                  disabled={status === 'processing'}
                >
                  {status === 'processing' ? 'Processing...' : 'Denoise Image'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setFile(null)
                    setPreviewUrl(null)
                    setDimensions(null)
                    resetResult()
                    setError(null)
                  }}
                  disabled={status === 'processing'}
                >
                  Choose Another Image
                </button>
              </div>

              <p className="helper-note">
                The AI model processes your image at its full original
                resolution (in overlapping tiles for larger images) — very
                large images may simply take a little longer to process.
              </p>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="card fade-in" style={{ marginTop: 24 }}>
            <LoadingSpinner
              title="Processing image..."
              message="Analyzing Image... Your image is being processed by the CNN model."
            />
          </div>
        )}

        {status === 'done' && resultUrl && (
          <div className="fade-in" style={{ marginTop: 48 }}>
            <h3 className="section-heading" style={{ fontSize: 24, textAlign: 'center' }}>
              Denoising Result
            </h3>

            <div className="result-grid" style={{ marginBottom: 28 }}>
              <div className="card image-card">
                <span className="pill tag">Input</span>
                <div className="frame">
                  <img src={previewUrl} alt="Original uploaded" />
                </div>
                <span className="caption">Original</span>
              </div>
              <div className="card image-card">
                <span className="pill tag">Cleaned by CNN</span>
                <div className="frame">
                  <img src={resultUrl} alt="AI denoised result" />
                </div>
                <span className="caption">AI Denoised</span>
              </div>
            </div>

            <h4 style={{ textAlign: 'center', marginBottom: 16 }}>
              Drag to Compare — Original vs. Denoised
            </h4>
            <ComparisonSlider
              beforeSrc={previewUrl}
              afterSrc={resultUrl}
              beforeLabel="Original"
              afterLabel="Denoised"
            />

            <div className="action-row" style={{ justifyContent: 'center', marginTop: 28 }}>
              <button className="btn btn-primary" onClick={handleDownload}>
                Download Denoised Image
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
