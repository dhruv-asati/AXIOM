import { useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, FileWarning } from 'lucide-react'

export function DisruptionRequestForm() {
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const validateLocally = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback('')
    if (!description.trim()) {
      setError('Enter a description before running local validation.')
      document.getElementById('disruption-description')?.focus()
      return
    }
    setError('')
    setFeedback('Local description check passed. Nothing was submitted or parsed.')
  }

  return (
    <form className="disruption-request-form" onSubmit={validateLocally} noValidate>
      <label htmlFor="disruption-description">Disruption description <span aria-hidden="true">*</span></label>
      <textarea
        id="disruption-description"
        rows={5}
        value={description}
        onChange={(event) => { setDescription(event.target.value); setError(''); setFeedback('') }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'disruption-description-error' : 'disruption-description-help'}
        placeholder="Describe what happened in your own words…"
      />
      {error ? <p id="disruption-description-error" className="disruption-field-error" role="alert"><AlertCircle size={14} />{error}</p>
        : <p id="disruption-description-help" className="disruption-field-help">This stays in this form. No disruption service is connected.</p>}
      <div className="disruption-form-footer">
        <span><FileWarning size={14} />Local validation only</span>
        <button type="submit" className="disruption-validate-button"><CheckCircle2 size={15} />Validate description</button>
      </div>
      {feedback && <p className="disruption-local-feedback" role="status"><CheckCircle2 size={14} />{feedback}</p>}
    </form>
  )
}
