import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Bot, CalendarClock, CornerDownLeft, LoaderCircle, Send, Sparkles, TicketCheck } from 'lucide-react'
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
import { getAssistantAutocompleteSuggestions } from '../components/assistant/assistantAutocomplete.mjs'
import { AssistantMemoryPanel } from '../components/assistant/AssistantMemoryPanel'
import { useAssistantMemory } from '../hooks/useAssistantMemory'

function readableChange(change: Record<string, unknown>): string {
  const dayNames: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday' }
  const days = Array.isArray(change.days) ? change.days.map(String).map((day) => dayNames[day] ?? day).join(', ') : ''
  const periods = Array.isArray(change.periods) ? change.periods.map(String).join(', ') : ''
  const when = [days, periods && `periods ${periods}`].filter(Boolean).join(' · ')
  if (change.type === 'room_unavailable') return `Room ${String(change.room_id ?? '—')} unavailable${when ? ` · ${when}` : ''}${change.reason ? ` · Reason: ${String(change.reason)}` : ''}`
  if (change.type === 'faculty_unavailable') return `Faculty ${String(change.faculty_id ?? '—')} unavailable${when ? ` · ${when}` : ''}${change.reason ? ` · Reason: ${String(change.reason)}` : ''}`
  if (change.type === 'remove_session') return `Remove session ${String(change.session_id ?? '—')}`
  if (change.type === 'add_session') return `Add session ${String((change.session as Record<string, unknown> | undefined)?.id ?? '')}`.trim()
  if (change.type === 'add_faculty') return `Add faculty ${String((change.faculty as Record<string, unknown> | undefined)?.name ?? (change.faculty as Record<string, unknown> | undefined)?.id ?? '')}`.trim()
  return 'Timetable change'
}

function readableValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' && item !== null
    ? Object.entries(item).map(([key, part]) => `${key.replaceAll('_', ' ')} ${String(part)}`).join(', ')
    : String(item)).join('; ')
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([key, part]) => `${key.replaceAll('_', ' ')} ${String(part)}`).join(', ')
  return String(value)
}

const bookingFieldNames: Record<string, string> = {
  requester: 'Requester', role: 'Role', department: 'Department', requested_category: 'Request type',
  title: 'Event', attendance: 'Expected attendance', duration_periods: 'Duration', windows: 'Preferred time',
  room_types: 'Room type', needs: 'Room requirements', requested_room: 'Preferred room',
  mandatory_for_groups: 'Required groups', series_id: 'Series',
}

export function AssistantPage() {
  const { selectedDatasetId } = useDatasetContext()
  const { user } = useAuth()
  const navigate = useNavigate()
  const commandRoot = useRef<HTMLDivElement>(null)
  const messageInput = useRef<HTMLTextAreaElement>(null)
  const positionFrame = useRef<number | null>(null)
  const [mode, setMode] = useState<'booking' | 'disruption'>('disruption')
  const [message, setMessage] = useState('')
  const [commandsOpen, setCommandsOpen] = useState(false)
  const [commandsAbove, setCommandsAbove] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [requester, setRequester] = useState('Campus coordinator')
  const [role, setRole] = useState<'admin' | 'department_coordinator' | 'faculty' | 'club'>('department_coordinator')
  const [department, setDepartment] = useState('')
  const [result, setResult] = useState<AssistantResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const memory = useAssistantMemory(user?.id, selectedDatasetId, user?.department)
  const commands = useMemo(() => user ? getAssistantCommands(user.role) : [], [user])
  const filteredCommands = useMemo(() => filterAssistantCommands(commands, message), [commands, message])
  const autocomplete = useMemo(() => getAssistantAutocompleteSuggestions(message, mode, user?.role ?? 'faculty', memory.enabled ? memory.items : []), [message, mode, user?.role, memory.enabled, memory.items])
  const activeSuggestion = autocomplete[activeCommandIndex]
  const activeCommand = filteredCommands[activeCommandIndex - autocomplete.length]
  const activeOptionId = activeSuggestion ? `assistant-autocomplete-${activeSuggestion.id}` : activeCommand ? `assistant-command-${activeCommand.id}` : undefined

  useEffect(() => {
    if (!commandsOpen) return
    const positionPopover = () => {
      if (positionFrame.current !== null) return
      positionFrame.current = requestAnimationFrame(() => {
      positionFrame.current = null
      const root = commandRoot.current
      if (!root) return
      const bounds = root.getBoundingClientRect()
      const below = Math.max(0, window.innerHeight - bounds.bottom - 16)
      const above = Math.max(0, bounds.top - 16)
      const openAbove = below < 280 && above > below
      setCommandsAbove(openAbove)
      root.style.setProperty('--assistant-popover-max-height', `${Math.max(120, (openAbove ? above : below) - 8)}px`)
      })
    }
    positionPopover()
    window.addEventListener('resize', positionPopover)
    window.addEventListener('scroll', positionPopover, true)
    return () => {
      if (positionFrame.current !== null) cancelAnimationFrame(positionFrame.current)
      positionFrame.current = null
      window.removeEventListener('resize', positionPopover)
      window.removeEventListener('scroll', positionPopover, true)
    }
  }, [commandsOpen, message, mode])

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

  useEffect(() => { setActiveCommandIndex(0) }, [message, mode])

  function chooseAutocomplete(suggestion: typeof autocomplete[number]) {
    setMode(suggestion.mode)
    setMessage(suggestion.text)
    setResult(null)
    setError('')
    setCommandsOpen(false)
    requestAnimationFrame(() => messageInput.current?.focus())
  }

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
    if (event.key === 'Tab') {
      if (commandsOpen && activeSuggestion) { event.preventDefault(); chooseAutocomplete(activeSuggestion) }
      else setCommandsOpen(false)
      return
    }
    const optionCount = autocomplete.length + filteredCommands.length
    if (!commandsOpen || !optionCount) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveCommandIndex((index) => (index + direction + optionCount) % optionCount)
    } else if (event.key === 'Enter' && !event.shiftKey && (activeSuggestion || activeCommand)) {
      event.preventDefault()
      if (activeSuggestion) chooseAutocomplete(activeSuggestion)
      else if (activeCommand) chooseCommand(activeCommand)
    }
  }

  const groupedCommands = ['Suggestions', 'Quick actions', 'Go to'].map((group) => ({
    group,
    entries: filteredCommands.filter((command) => command.group === group),
  })).filter(({ entries }) => entries.length > 0)
  const parse = async () => {
    if (!message.trim()) return
    setLoading(true); setError(''); setNotice(''); setResult(null)
    try {
      setResult(mode === 'booking' ? await parseBooking(message, { requester, role, department: department || undefined }) : await parseDisruption(message))
      memory.remember(message, mode)
    }
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
      memory.remember(message, 'booking')
      setNotice('Booking request submitted for deterministic review.'); setResult(null); setMessage('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Booking request could not be submitted') }
    finally { setLoading(false) }
  }
  return <div className="ops-page">
    <PageHeader eyebrow="AXIOM ASSISTANT" title="Request assistant" description="Convert natural language into a reviewable structured proposal. The parser does not make scheduling or approval decisions." />
    <section className="ops-card"><AssistantMemoryPanel items={memory.items} enabled={memory.enabled} onToggle={memory.setEnabled} onRemove={memory.remove} onClear={memory.clear} /><div className="ops-fields">
      <label className="ops-field">Request type<select value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setResult(null) }}><option value="disruption">Disruption</option><option value="booking">Booking</option></select></label>
      {mode === 'booking' && <><label className="ops-field">Requester<SmoothInput value={requester} onChange={(event) => setRequester(event.target.value)} /></label><label className="ops-field">Role<select value={role} onChange={(event) => setRole(event.target.value as typeof role)}><option value="department_coordinator">Department coordinator</option><option value="admin">Administrator</option><option value="faculty">Faculty</option><option value="club">Club</option></select></label><label className="ops-field">Department<SmoothInput value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Optional" /></label></>}
      <label className="ops-field assistant-command-field" style={{ flexBasis: '100%' }}>Describe the request
        <div className={`assistant-command-root${commandsAbove ? ' opens-above' : ''}`} ref={commandRoot}>
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
            aria-activedescendant={commandsOpen ? activeOptionId : undefined}
          />
          {commandsOpen && <div className="assistant-command-popover" id="assistant-command-list" role="listbox" aria-label="Assistant commands">
            {autocomplete.length > 0 && <section className="assistant-autocomplete-group" role="group" aria-label="Context-aware completions"><h3><Sparkles size={11} />Complete this request</h3>{autocomplete.map((suggestion, index) => {
              const isActive = index === activeCommandIndex
              const Icon = suggestion.icon === 'booking' ? TicketCheck : suggestion.icon === 'disruption' ? AlertCircle : CalendarClock
              return <div className={`assistant-autocomplete-option${isActive ? ' is-active' : ''}`} id={`assistant-autocomplete-${suggestion.id}`} role="option" aria-selected={isActive} key={suggestion.id} onMouseEnter={() => setActiveCommandIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAutocomplete(suggestion)}>
                <span className="assistant-autocomplete-icon"><Icon size={14} /></span><span className="assistant-autocomplete-copy"><strong>{suggestion.text}</strong><small>{suggestion.detail}</small></span><span className="assistant-command-hint">{isActive ? <CornerDownLeft size={13} /> : null}</span>
              </div>
            })}</section>}
            {groupedCommands.map(({ group, entries }) => <section className="assistant-command-group" key={group} role="group" aria-label={group}>
              <h3>{group}</h3>
              {entries.map((command) => {
                const Icon = command.icon
                const index = autocomplete.length + filteredCommands.findIndex((entry) => entry.id === command.id)
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
      {result.proposal?.type === 'disruption' && Array.isArray(result.proposal.data.changes) && <div className="disruption-proposal-section"><h4>Interpretation</h4><ul className="disruption-change-list">{result.proposal.data.changes.filter((change): change is Record<string, unknown> => !!change && typeof change === 'object').map((change, index) => <li key={index}>{readableChange(change)}</li>)}</ul></div>}
      {result.proposal?.type === 'booking' && <div className="disruption-proposal-section"><h4>Booking request</h4><ul className="disruption-change-list">{Object.entries(result.proposal.data).filter(([key, value]) => bookingFieldNames[key] && value !== null && value !== undefined && value !== '').map(([key, value]) => <li key={key}><strong>{bookingFieldNames[key]}:</strong> {key === 'duration_periods' ? `${String(value)} periods` : readableValue(value)}</li>)}</ul></div>}
      {result.proposal?.type === 'booking' && <button className="ops-button primary" type="button" disabled={loading || !selectedDatasetId} onClick={() => void acceptBooking()}>Submit booking request</button>}
      {result.proposal?.type === 'disruption' && <p className="ops-inline-note">Open Disruptions to select a baseline schedule and create a repair preview from this structured change.</p>}
    </section>}
  </div>
}
