import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { AlertCircle, ArrowUp, Bot, CalendarDays, DoorOpen, LoaderCircle, MessageCircleQuestion, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { loadAssistantAvailability } from '../api/assistant'

type AvailabilityState = 'checking' | 'unavailable' | 'error'

const suggestedPrompts = [
  { label: 'Find an available classroom', icon: DoorOpen },
  { label: 'Help me request a venue', icon: CalendarDays },
  { label: 'Show my timetable', icon: CalendarDays },
  { label: 'Help me report a campus disruption', icon: ShieldAlert },
  { label: 'Explain a scheduling conflict', icon: MessageCircleQuestion },
]

export function AssistantPage() {
  const [availability, setAvailability] = useState<AvailabilityState>('checking')
  const [availabilityReason, setAvailabilityReason] = useState('')
  const [draft, setDraft] = useState('')
  const [feedback, setFeedback] = useState('')
  const [feedbackKind, setFeedbackKind] = useState<'error' | 'info'>('info')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const checkAvailability = useCallback(async () => {
    setAvailability('checking')
    setFeedback('')
    try {
      const result = await loadAssistantAvailability()
      setAvailability(result.status)
      setAvailabilityReason(result.reason)
    } catch {
      setAvailability('error')
      setAvailabilityReason('The assistant service could not be checked. Try again when the service is available.')
    }
  }, [])

  useEffect(() => { void checkAvailability() }, [checkAvailability])

  const selectPrompt = (prompt: string) => {
    setDraft(prompt)
    setFeedback('')
    inputRef.current?.focus()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim()) {
      setFeedbackKind('error')
      setFeedback('Enter a message first.')
      inputRef.current?.focus()
      return
    }
    setFeedbackKind('info')
    setFeedback('Message not sent. The assistant API is not implemented, so your text remains only in this draft field.')
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div className="assistant-page">
      <PageHeader
        className="assistant-page-header"
        eyebrow="CAMPUS ASSISTANT"
        title="AI Assistant"
        description="Get help navigating campus operations with natural language."
        action={<button type="button" className="assistant-refresh-button" onClick={() => void checkAvailability()} disabled={availability === 'checking'}>{availability === 'checking' ? <LoaderCircle size={14} className="assistant-spin" /> : <RefreshCw size={14} />}<span>{availability === 'checking' ? 'Checking' : 'Check connection'}</span></button>}
      />

      <div className={`assistant-availability-banner is-${availability}`} role={availability === 'error' ? 'alert' : 'status'}>
        {availability === 'checking' ? <LoaderCircle size={15} className="assistant-spin" aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}
        <span><strong>{availability === 'checking' ? 'Checking assistant availability' : availability === 'error' ? 'Assistant unavailable' : 'AI integration pending'}</strong>{availability !== 'checking' && <span> — {availabilityReason}</span>}</span>
      </div>

      <div className="assistant-workspace">
        <section className="assistant-chat-panel" aria-label="Assistant conversation">
          <header className="assistant-chat-header">
            <span className="assistant-avatar"><Bot size={18} aria-hidden="true" /></span>
            <div><strong>AXIOM Assistant</strong><small>Campus operations support</small></div>
            <span className={`assistant-status-pill is-${availability}`}><i />{availability === 'checking' ? 'Checking' : availability === 'error' ? 'Unavailable' : 'Not connected'}</span>
          </header>

          <div className="assistant-conversation" role="region" aria-label="Current conversation" aria-live="polite">
            <div className="assistant-welcome-state">
              <span className="assistant-welcome-icon"><Sparkles size={20} aria-hidden="true" /></span>
              <h2>How can I help with campus operations?</h2>
              <p>Choose a prompt or write a draft. AI responses, parsing, and actions are unavailable until the assistant API contract is implemented.</p>
              <span className="assistant-session-note">No conversation history is loaded or stored. Draft text stays in this page.</span>
            </div>
          </div>

          <form className="assistant-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="assistant-message">Message the AXIOM Assistant</label>
            <textarea
              ref={inputRef}
              id="assistant-message"
              value={draft}
              onChange={(event) => { setDraft(event.target.value); setFeedback('') }}
              onKeyDown={handleInputKeyDown}
              placeholder="Write a message…"
              rows={3}
              aria-describedby="assistant-input-hint"
            />
            <div className="assistant-composer-footer">
              <span id="assistant-input-hint">Enter to check · Shift+Enter for a new line. This draft is not transmitted.</span>
              <button type="submit" className="assistant-send-button" aria-label="Send message"><ArrowUp size={17} /><span>Send</span></button>
            </div>
            {feedback && <p className={`assistant-feedback is-${feedbackKind}`} role={feedbackKind === 'error' ? 'alert' : 'status'}><AlertCircle size={14} />{feedback}</p>}
          </form>
        </section>

        <aside className="assistant-side-panel" aria-label="Assistant suggestions and connection details">
          <section className="assistant-suggestions-card" aria-labelledby="assistant-suggestions-heading">
            <div className="assistant-side-heading"><span><Sparkles size={15} /></span><div><p>GET STARTED</p><h2 id="assistant-suggestions-heading">Suggested prompts</h2></div></div>
            <p className="assistant-side-description">Select a suggestion to place it in your draft. It will not be sent automatically.</p>
            <div className="assistant-suggestion-list">{suggestedPrompts.map(({ label, icon: Icon }) => <button key={label} type="button" onClick={() => selectPrompt(label)}><Icon size={14} aria-hidden="true" /><span>{label}</span><span className="assistant-suggestion-arrow" aria-hidden="true">↗</span></button>)}</div>
          </section>
          <section className="assistant-capabilities-card" aria-labelledby="assistant-capabilities-heading">
            <div className="assistant-side-heading"><span className="is-capabilities"><MessageCircleQuestion size={15} /></span><div><p>INTEGRATION STATUS</p><h2 id="assistant-capabilities-heading">What is unavailable</h2></div></div>
            <ul><li>Natural-language understanding</li><li>Intent and entity extraction</li><li>Clarification responses</li><li>Booking or disruption proposals</li><li>Conversation history</li></ul>
            <p>These capabilities will appear only when returned by the approved AI/backend services.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
