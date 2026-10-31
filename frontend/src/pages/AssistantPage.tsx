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
}
