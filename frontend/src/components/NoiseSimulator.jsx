import { useCallback, useEffect, useRef, useState } from 'react'
import ImageUploader from './ImageUploader'
import LoadingSpinner from './LoadingSpinner'
import ComparisonSlider from './ComparisonSlider'
import { denoiseImage } from '../api'

// Maps a 0-100 slider percentage to a Gaussian noise standard deviation
// (in normalized 0-1 pixel space). Values are interpolated between these
// sensible reference points so 100% never fully destroys the image.
const NOISE_CURVE = [
  { pct: 0, stddev: 0.0 },
  { pct: 10, stddev: 0.03 },
  { pct: 25, stddev: 0.07 },
  { pct: 50, stddev: 0.12 },
  { pct: 75, stddev: 0.18 },
  { pct: 100, stddev: 0.25 },
]

function stddevForPercent(pct) {
  for (let i = 0; i < NOISE_CURVE.length - 1; i++) {
    const a = NOISE_CURVE[i]
    const b = NOISE_CURVE[i + 1]
    if (pct >= a.pct && pct <= b.pct) {
      const t = (pct - a.pct) / (b.pct - a.pct)
      return a.stddev + t * (b.stddev - a.stddev)
    }
  }
  return NOISE_CURVE[NOISE_CURVE.length - 1].stddev
}

// Box-Muller transform for standard-normal random samples.
function randomGaussian() {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

const PRESETS = [
  { label: 'Light', value: 20 },
  { label: 'Medium', value: 40 },
  { label: 'Strong', value: 70 },
  { label: 'Extreme', value: 100 },
]

// Cap the working canvas resolution for smooth, responsive noise generation
// while the slider is dragged.
const MAX_PREVIEW_DIM = 640

export default function NoiseSimulator() {
  const [cleanUrl, setCleanUrl] = useState(null)
  const [cleanFileName, setCleanFileName] = useState('')
  const [noiseLevel, setNoiseLevel] = useState(0)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle') // idle | processing | done
  const [resultUrl, setResultUrl] = useState(null)
  const [noisySnapshotUrl, setNoisySnapshotUrl] = useState(null)
  const [statusMessage, setStatusMessage] = useState(null)

  const cleanImgRef = useRef(null) // HTMLImageElement, full resolution
  const canvasRef = useRef(null) // visible noisy-preview canvas
  const cleanUrlRef = useRef(null)
  const resultUrlRef = useRef(null)
  const noisySnapshotRef = useRef(null)

  useEffect(() => {
    return () => {
      if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current)
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
    }
  }, [])

  const drawNoisyPreview = useCallback((pct) => {
    const img = cleanImgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    const scale = Math.min(1, MAX_PREVIEW_DIM / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    // Always redraw from the original clean image so noise never
    // accumulates across repeated slider movements.
    ctx.drawImage(img, 0, 0, w, h)

    const stddev = stddevForPercent(pct)
    if (stddev > 0) {
      const imageData = ctx.getImageData(0, 0, w, h)
      const data = imageData.data
      const amount = stddev * 255
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, data[i] + randomGaussian() * amount))
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + randomGaussian() * amount))
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + randomGaussian() * amount))
        // alpha channel (i + 3) left untouched
      }
      ctx.putImageData(imageData, 0, 0)
    }
  }, [])

  useEffect(() => {
    if (cleanUrl) drawNoisyPreview(noiseLevel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noiseLevel, cleanUrl])

  const handleFileSelected = (file) => {
    setError(null)
    setStatus('idle')
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current)
      resultUrlRef.current = null
    }
    setResultUrl(null)
    setNoisySnapshotUrl(null)

    if (cleanUrlRef.current) URL.revokeObjectURL(cleanUrlRef.current)
    const url = URL.createObjectURL(file)
    cleanUrlRef.current = url
    setCleanUrl(url)
    setCleanFileName(file.name)
    setNoiseLevel(0)

    const img = new Image()
    img.onload = () => {
      cleanImgRef.current = img
      drawNoisyPreview(0)
    }
    img.src = url
  }

  const handleReset = () => {
    setNoiseLevel(0)
  }

  const handleDenoiseNoisy = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    setError(null)
    setStatusMessage(null)
    setStatus('processing')

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setError('Unable to read the noisy image. Please try again.')
        setStatus('idle')
        return
      }

      if (noisySnapshotRef.current) URL.revokeObjectURL(noisySnapshotRef.current)
      const snapshotUrl = URL.createObjectURL(blob)
      noisySnapshotRef.current = snapshotUrl
      setNoisySnapshotUrl(snapshotUrl)

      try {
        const url = await denoiseImage(blob, 'noisy-image.png', setStatusMessage)
        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
        resultUrlRef.current = url
        setResultUrl(url)
        setStatus('done')
      } catch (err) {
        setError(err.message || 'Something went wrong while processing the image.')
        setStatus('idle')
      } finally {
        setStatusMessage(null)
      }
    }, 'image/png')
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

  const fillPct = `${noiseLevel}%`

  return (
    <section id="noise-simulator" className="section section-alt">
      <div className="app-shell">
        <div className="section-header fade-in">
          <span className="eyebrow">Interactive Demo</span>
          <h2 className="section-heading">Noise Simulator</h2>
          <p className="section-sub">
            Want to see how our model handles noise? Upload a clean image and
            control the amount of artificial noise using the slider.
          </p>
        </div>

        {error && (
          <div className="error-banner fade-in" role="alert" style={{ marginBottom: 24 }}>
            ⚠ {error}
          </div>
        )}

        {!cleanUrl && (
          <ImageUploader
            title="Upload a clean image"
            onFileSelected={handleFileSelected}
            onError={setError}
          />
        )}

        {cleanUrl && (
          <div className="fade-in">
            <div className="noise-preview-grid">
              <div className="card image-card">
                <span className="pill tag">Clean Image</span>
                <div className="frame">
                  <img src={cleanUrl} alt={`Clean upload: ${cleanFileName}`} />
                </div>
                <span className="caption">{cleanFileName}</span>
              </div>
              <div className="card image-card">
                <span className="pill tag">Noisy Preview</span>
                <div className="frame">
                  <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
                </div>
                <span className="caption">Generated locally in your browser</span>
              </div>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <div className="slider-row">
                <div className="slider-label-row">
                  <span>Noise Level</span>
                  <span className="value">Noise Level: {noiseLevel}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={noiseLevel}
                  aria-label="Noise level"
                  style={{ '--fill': fillPct }}
                  onChange={(e) => setNoiseLevel(Number(e.target.value))}
                />
                <div className="slider-scale">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="preset-row">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className={`preset-btn${noiseLevel === preset.value ? ' active' : ''}`}
                    onClick={() => setNoiseLevel(preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
                <button className="preset-btn" onClick={handleReset}>
                  Reset
                </button>
              </div>

              <div className="flow-steps">
                <span className="step">Clean Original</span>
                <span className="arrow">→</span>
                <span className="step">Artificial Noise</span>
                <span className="arrow">→</span>
                <span className="step">CNN Denoising</span>
                <span className="arrow">→</span>
                <span className="step">Recovered Image</span>
              </div>

              <div className="action-row" style={{ justifyContent: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleDenoiseNoisy}
                  disabled={status === 'processing'}
                >
                  {status === 'processing' ? 'Processing...' : 'Denoise This Image'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setCleanUrl(null)
                    setNoiseLevel(0)
                    setResultUrl(null)
                    setNoisySnapshotUrl(null)
                    setError(null)
                    setStatus('idle')
                  }}
                  disabled={status === 'processing'}
                >
                  Choose Another Image
                </button>
              </div>
            </div>
          </div>
        )}

        {status === 'processing' && (
          <div className="card fade-in" style={{ marginTop: 24 }}>
            <LoadingSpinner
              title="Processing image..."
              message={statusMessage || 'Your artificially noisy image is being processed by the CNN model.'}
            />
          </div>
        )}

        {status === 'done' && resultUrl && (
          <div className="fade-in" style={{ marginTop: 48 }}>
            <h3 className="section-heading" style={{ fontSize: 24, textAlign: 'center' }}>
              Noise Simulator Result
            </h3>

            <div className="result-grid-3" style={{ marginBottom: 28 }}>
              <div className="card image-card">
                <span className="pill tag">Original Clean</span>
                <div className="frame">
                  <img src={cleanUrl} alt="Original clean upload" />
                </div>
              </div>
              <div className="card image-card">
                <span className="pill tag">Artificially Noisy</span>
                <div className="frame">
                  <img src={noisySnapshotUrl} alt="Artificially noised image" />
                </div>
              </div>
              <div className="card image-card">
                <span className="pill tag">CNN Denoised</span>
                <div className="frame">
                  <img src={resultUrl} alt="CNN denoised result" />
                </div>
              </div>
            </div>

            <h4 style={{ textAlign: 'center', marginBottom: 16 }}>
              Drag to Compare — Noisy vs. Denoised
            </h4>
            <ComparisonSlider
              beforeSrc={noisySnapshotUrl}
              afterSrc={resultUrl}
              beforeLabel="Noisy"
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
