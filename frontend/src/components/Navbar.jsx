import { useState } from 'react'

const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'denoise', label: 'Denoise' },
  { id: 'noise-simulator', label: 'Noise Simulator' },
  { id: 'about', label: 'About' },
]

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollTo = (id) => {
    setMenuOpen(false)
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <button className="brand" onClick={() => scrollTo('home')} aria-label="DenoiseAI home">
          <span className="brand-icon" aria-hidden="true">✨</span>
          DenoiseAI
        </button>

        <nav aria-label="Primary">
          <ul className="nav-links">
            {LINKS.map((link) => (
              <li key={link.id}>
                <button onClick={() => scrollTo(link.id)}>{link.label}</button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="nav-actions">
          <button className="btn btn-primary btn-sm" onClick={() => scrollTo('denoise')}>
            Try Now
          </button>
          <button
            className="nav-toggle"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="mobile-menu">
          {LINKS.map((link) => (
            <button key={link.id} onClick={() => scrollTo(link.id)}>
              {link.label}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
