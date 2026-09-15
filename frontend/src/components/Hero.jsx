import { useEffect, useState } from 'react'

export default function Hero() {
  // Purely CSS/placeholder animated demonstration — no real image required.
  const [clip, setClip] = useState(35)

  useEffect(() => {
    const id = setInterval(() => {
      setClip((prev) => (prev === 35 ? 65 : 35))
    }, 2400)
    return () => clearInterval(id)
  }, [])

  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section id="home" className="hero">
      <div className="app-shell hero-grid">
        <div className="fade-in">
          <span className="eyebrow">CNN-Powered Image Restoration</span>
          <h1>
            Remove Image Noise
            <br />
            <span className="gradient-text">with AI</span>
          </h1>
          <p className="lead">
            Upload a noisy color image and let our CNN model restore it into a
            cleaner, sharper image.
          </p>

          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => scrollTo('denoise')}>
              Upload Image
            </button>
            <button className="btn btn-secondary" onClick={() => scrollTo('noise-simulator')}>
              Try Noise Simulator
            </button>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <b>RGB</b>
              <span>Full color support</span>
            </div>
            <div className="hero-stat">
              <b>CNN</b>
              <span>Trained denoising model</span>
            </div>
            <div className="hero-stat">
              <b>Instant</b>
              <span>Browser-based preview</span>
            </div>
          </div>
        </div>

        <div className="hero-demo fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="demo-card" style={{ '--demo-clip': `${clip}%` }}>
            <div className="demo-layer demo-noisy" />
            <div className="demo-layer demo-clean" />
            <div className="demo-divider" />
            <span className="demo-label left">NOISY IMAGE</span>
            <span className="demo-label right">AI DENOISED</span>
          </div>
        </div>
      </div>
    </section>
  )
}
