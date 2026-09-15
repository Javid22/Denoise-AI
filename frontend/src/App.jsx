import Navbar from './components/Navbar'
import Hero from './components/Hero'
import DenoiseSection from './components/DenoiseSection'
import NoiseSimulator from './components/NoiseSimulator'
import About from './components/About'
import Footer from './components/Footer'

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <DenoiseSection />
        <NoiseSimulator />
        <About />
      </main>
      <Footer />
    </>
  )
}
