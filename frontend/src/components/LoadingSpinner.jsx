export default function LoadingSpinner({
  title = 'Analyzing Image...',
  message = 'Your image is being processed by the CNN model.',
}) {
  return (
    <div className="loading-panel" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <div>
        <strong>{title}</strong>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div className="progress-fill" />
      </div>
      <p className="helper-note">{message}</p>
    </div>
  )
}
