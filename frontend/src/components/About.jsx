const STEPS = [
  {
    num: '01',
    title: 'Upload',
    text: 'Upload a noisy RGB image.',
  },
  {
    num: '02',
    title: 'AI Processing',
    text: 'The image is processed using a CNN trained for image denoising.',
  },
  {
    num: '03',
    title: 'Clean Result',
    text: 'The model predicts a cleaner version of the image.',
  },
]

const MODEL_INFO = [
  { label: 'Model Type', value: 'CNN' },
  { label: 'Framework', value: 'TensorFlow / Keras' },
  { label: 'Input', value: 'RGB Image' },
  { label: 'Output', value: 'Denoised RGB Image' },
  { label: 'Format', value: 'H5' },
]

export default function About() {
  return (
    <section id="about" className="section">
      <div className="app-shell">
        <div className="section-header fade-in">
          <span className="eyebrow">About</span>
          <h2 className="section-heading">How DenoiseAI Works</h2>
        </div>

        <div className="steps-grid">
          {STEPS.map((step) => (
            <div key={step.num} className="card step-card fade-in">
              <div className="step-num">{step.num}</div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          ))}
        </div>

        <p className="about-note fade-in">
          The CNN learns the relationship between noisy images and their
          clean counterparts during training. During inference, it predicts a
          cleaner representation of the uploaded image. Results vary by image
          and noise type — the model is not guaranteed to remove all noise.
        </p>

        <div className="section-header fade-in" style={{ marginBottom: 28 }}>
          <span className="eyebrow">Under the Hood</span>
          <h3 className="section-heading" style={{ fontSize: 26 }}>
            Model Information
          </h3>
        </div>

        <div className="model-info-grid fade-in">
          {MODEL_INFO.map((item) => (
            <div key={item.label} className="card model-info-item">
              <div className="label">{item.label}</div>
              <div className="value">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
