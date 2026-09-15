import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Interactive before/after image comparison slider.
 * Drag (mouse or touch) the vertical divider from 0% -> 100% to reveal
 * more or less of the "after" image over the "before" image.
 */
export default function ComparisonSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Original',
  afterLabel = 'Denoised',
}) {
  const [percent, setPercent] = useState(50)
  const containerRef = useRef(null)
  const draggingRef = useRef(false)

  const updateFromClientX = useCallback((clientX) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    const clamped = Math.min(1, Math.max(0, ratio))
    setPercent(Math.round(clamped * 100))
  }, [])

  useEffect(() => {
    const handleMove = (e) => {
      if (!draggingRef.current) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      updateFromClientX(clientX)
    }
    const handleUp = () => {
      draggingRef.current = false
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: true })
    window.addEventListener('touchend', handleUp)

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [updateFromClientX])

  const startDrag = (e) => {
    draggingRef.current = true
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    updateFromClientX(clientX)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setPercent((p) => Math.max(0, p - 5))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setPercent((p) => Math.min(100, p + 5))
    }
  }

  return (
    <div
      className="comparison-slider"
      ref={containerRef}
      onMouseDown={startDrag}
      onTouchStart={startDrag}
      style={{ '--pos': `${percent}%` }}
    >
      <span className="comparison-tag left">{beforeLabel}</span>
      <span className="comparison-tag right">{afterLabel}</span>

      <img src={beforeSrc} alt={`${beforeLabel} image`} draggable={false} />

      <div className="after-layer">
        <img src={afterSrc} alt={`${afterLabel} image`} draggable={false} />
      </div>

      <div
        className="comparison-handle"
        role="slider"
        tabIndex={0}
        aria-label="Comparison slider position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        onKeyDown={handleKeyDown}
      />

      <span className="comparison-percent">{percent}%</span>
    </div>
  )
}
