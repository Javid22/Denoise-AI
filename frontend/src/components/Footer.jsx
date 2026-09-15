const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'denoise', label: 'Denoise' },
  { id: 'noise-simulator', label: 'Noise Simulator' },
  { id: 'about', label: 'About' },
]

export default function Footer() {
  const scrollTo = (id) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <footer className="footer">
      <div className="app-shell footer-inner">
        <div className="footer-brand">
          <div className="brand" style={{ cursor: 'default' }}>
            <span className="brand-icon" aria-hidden="true">✨</span>
            DenoiseAI
          </div>
          <p>AI-powered image denoising</p>
        </div>

        <ul className="footer-links">
          {LINKS.map((link) => (
            <li key={link.id}>
              <button onClick={() => scrollTo(link.id)}>{link.label}</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="footer-bottom">© 2026 DenoiseAI</div>
    </footer>
  )
}
