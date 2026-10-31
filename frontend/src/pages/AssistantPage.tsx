<<<<<<< HEAD
import { useState } from 'react'
import { AlertCircle, Bot, LoaderCircle, Send } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { parseBooking, parseDisruption, submitBooking } from '../api/resources'
import { useDatasetContext } from '../context/DatasetContext'
import type { AssistantResponse } from '../types/api'
import './Operations.css'
import { SkeletonPage, SkeletonText } from '../components/ui/Skeleton'

export function AssistantPage() {
  const { selectedDatasetId } = useDatasetContext()
  const [mode, setMode] = useState<'booking' | 'disruption'>('disruption')
  const [message, setMessage] = useState('')
  const [requester, setRequester] = useState('Campus coordinator')
  const [role, setRole] = useState<'admin' | 'department_coordinator' | 'faculty' | 'club'>('department_coordinator')
  const [department, setDepartment] = useState('')
  const [result, setResult] = useState<AssistantResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const parse = async () => {
    if (!message.trim()) return
    setLoading(true); setError(''); setNotice(''); setResult(null)
    try { setResult(mode === 'booking' ? await parseBooking(message, { requester, role, department: department || undefined }) : await parseDisruption(message)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Assistant parsing failed') }
    finally { setLoading(false) }
  }
  const acceptBooking = async () => {
    if (!selectedDatasetId || result?.proposal?.type !== 'booking') return
    const data = result.proposal.data
    if (!data.requested_category || !data.title) { setError('The parsed booking needs a category and title before submission.'); return }
    setLoading(true); setError('')
    try {
      await submitBooking(selectedDatasetId, data, message, `assistant-${crypto.randomUUID()}`)
      setNotice('Booking request submitted for deterministic review.'); setResult(null); setMessage('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Booking request could not be submitted') }
    finally { setLoading(false) }
  }
  return <div className="ops-page">
    <PageHeader eyebrow="AXIOM ASSISTANT" title="Request assistant" description="Convert natural language into a reviewable structured proposal. The parser does not make scheduling or approval decisions." />
    <section className="ops-card"><div className="ops-fields">
      <label className="ops-field">Request type<select value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setResult(null) }}><option value="disruption">Disruption</option><option value="booking">Booking</option></select></label>
      {mode === 'booking' && <><label className="ops-field">Requester<input value={requester} onChange={(event) => setRequester(event.target.value)} /></label><label className="ops-field">Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="department_coordinator">Department coordinator</option><option value="admin">Administrator</option><option value="faculty">Faculty</option><option value="club">Club</option></select></label><label className="ops-field">Department<input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Optional" /></label></>}
      <label className="ops-field" style={{ flexBasis: '100%' }}>Describe the request<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={mode === 'disruption' ? 'For example: Room 204 is unavailable on Monday; reschedule affected classes.' : 'Describe the event, attendance, preferred time and room needs.'} /></label>
      <button className="ops-button primary" type="button" disabled={loading || !message.trim()} onClick={() => void parse()}>{loading ? <LoaderCircle size={14} className="is-spinning"/> : <Send size={14}/>}Parse request</button>
    </div></section>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15}/>{error}</div>}{notice && <div className="ops-message success" role="status">{notice}</div>}
    {loading && !result && <SkeletonPage label="Preparing assistant interpretation"><section className="ops-card"><div className="ops-card-heading"><div><h2>Interpreting request</h2><p>Preparing a structured response for review.</p></div></div><SkeletonText lines={4}/></section></SkeletonPage>}
    {result && <section className="ops-card"><div className="ops-card-heading"><div><h2><Bot size={15}/> Interpretation for review</h2><p>Status: {result.status}. No changes have been approved or applied.</p></div></div>
      {result.missing_fields.length > 0 && <div className="ops-callout">More information needed: {result.missing_fields.join(', ')}{result.clarification?.question ? ` — ${result.clarification.question}` : ''}</div>}
      {result.assumptions.length > 0 && <p className="ops-inline-note">Assumptions: {result.assumptions.join('; ')}</p>}
      {result.warnings.map((warning) => <div className="ops-message" key={warning.code}>{warning.message}</div>)}
      {result.proposal && <pre className="ops-json">{JSON.stringify(result.proposal.data, null, 2)}</pre>}
      {result.proposal?.type === 'booking' && <button className="ops-button primary" type="button" disabled={loading || !selectedDatasetId} onClick={() => void acceptBooking()}>Submit booking request</button>}
      {result.proposal?.type === 'disruption' && <p className="ops-inline-note">Open Disruptions to select a baseline schedule and create a repair preview from this structured change.</p>}
    </section>}
  </div>
=======
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
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08
}
