import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Bot, CornerDownLeft, LoaderCircle, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { parseBooking, parseDisruption, submitBooking } from '../api/resources'
import { useDatasetContext } from '../context/DatasetContext'
import { useAuth } from '../auth/AuthContext'
import type { AssistantResponse } from '../types/api'
import './Operations.css'
import './AssistantCommands.css'
import { SkeletonPage, SkeletonText } from '../components/ui/Skeleton'
import { SmoothInput } from '../components/ui/SmoothInput'
import { SmoothTextarea } from '../components/ui/SmoothTextarea'
import { SpecularButton } from '../components/ui/SpecularButton'
import { filterAssistantCommands, getAssistantCommands, type AssistantCommand } from '../components/assistant/assistantCommands'

export function AssistantPage() {
  const { selectedDatasetId } = useDatasetContext()
  const { user } = useAuth()
  const navigate = useNavigate()
  const commandRoot = useRef<HTMLDivElement>(null)
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState<'booking' | 'disruption'>('disruption')
  const [message, setMessage] = useState('')
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [requester, setRequester] = useState('Campus coordinator')
  const [role, setRole] = useState<'admin' | 'department_coordinator' | 'faculty' | 'club'>('department_coordinator')
  const [department, setDepartment] = useState('')
  const [result, setResult] = useState<AssistantResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const commands = useMemo(() => user ? getAssistantCommands(user.role) : [], [user])
  const filteredCommands = useMemo(() => filterAssistantCommands(commands, message), [commands, message])
  const activeCommand = filteredCommands[activeCommandIndex]

  useEffect(() => {
    const onOutsidePointer = (event: PointerEvent) => {
      if (!commandRoot.current?.contains(event.target as Node)) setCommandsOpen(false)
    }
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        messageInput.current?.focus()
        setCommandsOpen(true)
      }
    }
    document.addEventListener('pointerdown', onOutsidePointer)
    document.addEventListener('keydown', onShortcut)
    return () => {
      document.removeEventListener('pointerdown', onOutsidePointer)
      document.removeEventListener('keydown', onShortcut)
    }
  }, [])

  useEffect(() => { setActiveCommandIndex(0) }, [message])

  function chooseCommand(command: AssistantCommand) {
    if (command.type === 'route' && command.href) {
      setCommandsOpen(false)
      navigate(command.href)
      return
    }
    if (command.mode) {
      setMode(command.mode)
      setResult(null)
      setError('')
    }
    if (command.type === 'template' && command.template) {
      setMessage(command.template)
      requestAnimationFrame(() => {
        const input = messageInput.current
        input?.focus()
        input?.setSelectionRange(command.template?.length ?? 0, command.template?.length ?? 0)
      })
      setCommandsOpen(false)
      return
    }
    setCommandsOpen(false)
  }

  function handleCommandKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && commandsOpen) { event.preventDefault(); setCommandsOpen(false); return }
    if (event.key === 'Tab') { setCommandsOpen(false); return }
    if (!commandsOpen || !filteredCommands.length) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveCommandIndex((index) => (index + direction + filteredCommands.length) % filteredCommands.length)
    } else if (event.key === 'Enter' && !event.shiftKey && activeCommand) {
      event.preventDefault()
      chooseCommand(activeCommand)
    }
  }

  const groupedCommands = ['Suggestions', 'Quick actions', 'Go to'].map((group) => ({
    group,
    entries: filteredCommands.filter((command) => command.group === group),
  })).filter(({ entries }) => entries.length > 0)
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
      {mode === 'booking' && <><label className="ops-field">Requester<SmoothInput value={requester} onChange={(event) => setRequester(event.target.value)} /></label><label className="ops-field">Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="department_coordinator">Department coordinator</option><option value="admin">Administrator</option><option value="faculty">Faculty</option><option value="club">Club</option></select></label><label className="ops-field">Department<SmoothInput value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Optional" /></label></>}
      <label className="ops-field assistant-command-field" style={{ flexBasis: '100%' }}>Describe the request
        <div className="assistant-command-root" ref={commandRoot}>
          <SmoothTextarea
            ref={messageInput}
            value={message}
            onChange={(event) => { setMessage(event.target.value); setCommandsOpen(true) }}
            onFocus={() => setCommandsOpen(true)}
            onKeyDown={handleCommandKeyDown}
            placeholder={mode === 'disruption' ? 'For example: Room 204 is unavailable on Monday; reschedule affected classes.' : 'Describe the event, attendance, preferred time and room needs.'}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={commandsOpen}
            aria-controls="assistant-command-list"
            aria-activedescendant={commandsOpen && activeCommand ? `assistant-command-${activeCommand.id}` : undefined}
          />
          {commandsOpen && <div className="assistant-command-popover" id="assistant-command-list" role="listbox" aria-label="Assistant commands">
            {groupedCommands.map(({ group, entries }) => <section className="assistant-command-group" key={group} role="group" aria-label={group}>
              <h3>{group}</h3>
              {entries.map((command) => {
                const Icon = command.icon
                const index = filteredCommands.findIndex((entry) => entry.id === command.id)
                const isActive = index === activeCommandIndex
                return <div
                  className={`assistant-command-option${isActive ? ' is-active' : ''}`}
                  id={`assistant-command-${command.id}`}
                  role="option"
                  aria-selected={isActive}
                  key={command.id}
                  onMouseEnter={() => setActiveCommandIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseCommand(command)}
                >
                  <span className="assistant-command-icon"><Icon size={15} strokeWidth={1.7} /></span>
                  <span className="assistant-command-copy"><strong>{command.label}</strong><small>{command.description}</small></span>
                  <span className="assistant-command-hint">{isActive ? <CornerDownLeft size={13} /> : command.type === 'route' ? <ArrowDown size={12} /> : null}</span>
                </div>
              })}
            </section>)}
            {filteredCommands.length === 0 && <p className="assistant-command-empty">No results. You can still send this as a free-text request.</p>}
            <div className="assistant-command-footer"><span><kbd><ArrowUp size={9}/></kbd><kbd><ArrowDown size={9}/></kbd> Navigate</span><span><kbd>↵</kbd> Select</span><span><kbd>esc</kbd> Close</span></div>
          </div>}
        </div>
      </label>
      <SpecularButton className="ops-button primary" type="button" disabled={loading || !message.trim()} onClick={() => void parse()}>{loading ? <LoaderCircle size={14} className="is-spinning"/> : <Send size={14}/>}Parse request</SpecularButton>
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
