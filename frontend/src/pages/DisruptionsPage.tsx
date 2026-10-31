<<<<<<< HEAD
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RefreshCw, ShieldAlert } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { createRepairProposal, decideRepair, listRepairProposals, listSchedules, parseDisruption } from '../api/resources'
import { useDatasetContext } from '../context/DatasetContext'
import type { AssistantResponse, RepairProposal, ScheduleAssignments, ScheduleSummary } from '../types/api'
import { getAssignments } from '../api/resources'
import { invalidateApiCache } from '../api/client'
import './Operations.css'
import { SkeletonCard, SkeletonPage } from '../components/ui/Skeleton'

type Change = Record<string, unknown>
export function DisruptionsPage() {
  const { selectedDatasetId } = useDatasetContext()
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [assignments, setAssignments] = useState<ScheduleAssignments | null>(null)
  const [proposals, setProposals] = useState<RepairProposal[]>([])
  const [message, setMessage] = useState('')
  const [parsed, setParsed] = useState<AssistantResponse | null>(null)
  const [changeType, setChangeType] = useState<'room_unavailable' | 'faculty_unavailable' | 'remove_session'>('room_unavailable')
  const [targetId, setTargetId] = useState('')
  const [days, setDays] = useState('MON')
  const [periods, setPeriods] = useState('1')
  const [reason, setReason] = useState('Campus disruption')
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loadedDatasetId, setLoadedDatasetId] = useState('')
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async (force = false) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    if (!selectedDatasetId) { setLoading(false); setDataLoading(false); setLoadedDatasetId(''); return }
    setLoading(true); setDataLoading(true); setError('')
    if (force) invalidateApiCache(`/datasets/${selectedDatasetId}`)
    try {
      const [rows, nextProposals] = await Promise.all([listSchedules(selectedDatasetId, controller.signal), listRepairProposals(selectedDatasetId, controller.signal)])
      if (controller.signal.aborted) return
      setSchedules(rows)
      setScheduleId((current) => current && rows.some((row) => row.schedule_id === current) ? current : rows.find((row) => row.status === 'complete')?.schedule_id ?? '')
      setProposals(nextProposals)
      setLoadedDatasetId(selectedDatasetId)
    } catch (cause) { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Disruption workspace could not be loaded'); setLoadedDatasetId(selectedDatasetId) } }
    finally { if (!controller.signal.aborted) { setLoading(false); setDataLoading(false) } }
  }, [selectedDatasetId])
  useEffect(() => {
    setSchedules([]); setScheduleId(''); setAssignments(null); setProposals([]); setLoadedDatasetId('')
    void load()
    return () => request.current?.abort()
  }, [load])
  useEffect(() => {
    let active = true
    if (!selectedDatasetId || !scheduleId) { setAssignments(null); return }
    const controller = new AbortController()
    getAssignments(selectedDatasetId, scheduleId, {}, controller.signal).then((data) => active && setAssignments(data)).catch((cause) => active && !controller.signal.aborted && setError(cause instanceof Error ? cause.message : 'Schedule assignments unavailable'))
    return () => { active = false; controller.abort() }
  }, [selectedDatasetId, scheduleId])
  const parsedChange = async () => {
    if (!message.trim()) return
    setLoading(true); setError(''); setParsed(null)
    try { setParsed(await parseDisruption(message)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not parse disruption') }
    finally { setLoading(false) }
  }
  const submit = async (changes: Change[]) => {
    if (!selectedDatasetId || !scheduleId || changes.length === 0) return
    setLoading(true); setError(''); setNotice('')
    try {
      const proposal = await createRepairProposal(selectedDatasetId, scheduleId, changes)
      setNotice(`Repair proposal created (${proposal.proposal_id}). The baseline schedule remains unchanged until approval.`)
      setParsed(null); setMessage(''); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Repair proposal could not be created') }
    finally { setLoading(false) }
  }
  const makeManualChange = (): Change[] => {
    if (changeType === 'remove_session') return targetId ? [{ type: changeType, session_id: targetId }] : []
    const ids = periods.split(',').map(Number).filter((number) => Number.isInteger(number) && number > 0)
    const selectedDays = days.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
    if (!targetId || ids.length === 0 || selectedDays.length === 0) return []
    return [{ type: changeType, [changeType === 'room_unavailable' ? 'room_id' : 'faculty_id']: targetId, days: selectedDays, periods: ids, reason }]
  }
  const applyParsed = () => {
    const data = parsed?.proposal?.data as { changes?: Change[] } | undefined
    if (parsed?.status !== 'proposal_ready' || !data?.changes?.length) { setError('The parser did not return a complete disruption proposal.'); return }
    void submit(data.changes)
  }
  const decide = async (proposal: RepairProposal, action: 'approve' | 'reject') => {
    if (!selectedDatasetId || !window.confirm(action === 'approve' ? 'Approve this repair? It creates a new schedule and preserves the baseline.' : 'Reject this repair proposal?')) return
    setLoading(true); setError('')
    try { await decideRepair(selectedDatasetId, proposal.baseline_schedule_id, proposal.proposal_id, action); setNotice(action === 'approve' ? 'Repair approved. A derived schedule was created; the baseline is preserved.' : 'Repair proposal rejected.'); await load() }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Could not ${action} repair`) }
    finally { setLoading(false) }
  }
  const sessions = assignments?.assignments ?? []
  const roomIds = [...new Set(sessions.map((item) => item.room_id))]
  const facultyIds = [...new Set(sessions.map((item) => item.faculty_id))]
  return <div className="ops-page">
    <PageHeader eyebrow="DISRUPTION RESPONSE" title="Repair proposals" description="Describe or structure a disruption, inspect a solver-generated repair proposal, then explicitly approve or reject it." />
    <section className="ops-toolbar"><label className="ops-field">Baseline schedule<select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Select schedule</option>{schedules.map((s) => <option key={s.schedule_id} value={s.schedule_id}>{new Date(s.created_at).toLocaleString()} · {s.status}</option>)}</select></label><button className="ops-button" onClick={() => void load(true)} disabled={loading}><RefreshCw size={14}/>Refresh</button></section>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15}/>{error}</div>}{notice && <div className="ops-message success" role="status">{notice}</div>}{dataLoading && loadedDatasetId === selectedDatasetId && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton"/>Refreshing disruption records…</span>}
    {dataLoading && loadedDatasetId !== selectedDatasetId && <SkeletonPage label="Loading disruption workspace"><div className="ops-card-grid"><SkeletonCard/><SkeletonCard/><SkeletonCard/></div></SkeletonPage>}
    <section className="ops-card"><div className="ops-card-heading"><div><h2>Natural language request</h2><p>Parsing creates an interpretation only; this page submits a proposal for solver review.</p></div></div><div className="ops-fields"><label className="ops-field" style={{ flexBasis: '100%' }}>Disruption description<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="For example: Room R204 is unavailable Monday during periods 2 and 3." /></label><button className="ops-button" type="button" disabled={loading || !message.trim()} onClick={() => void parsedChange()}>Parse request</button>{parsed?.proposal?.type === 'disruption' && <button className="ops-button primary" type="button" disabled={loading || !scheduleId} onClick={applyParsed}>Generate repair proposal</button>}</div>{parsed && <><p className="ops-inline-note">Parser status: {parsed.status}. Review the structured interpretation before continuing.</p>{parsed.missing_fields.length > 0 && <div className="ops-callout">Needs clarification: {parsed.missing_fields.join(', ')} {parsed.clarification?.question}</div>}<pre className="ops-json">{JSON.stringify(parsed.proposal?.data ?? parsed.extracted_entities, null, 2)}</pre></>}</section>
    <section className="ops-card"><div className="ops-card-heading"><div><h2>Structured disruption</h2><p>Use source IDs from the selected dataset. Changes remain proposals until approval.</p></div></div><div className="ops-fields"><label className="ops-field">Change type<select value={changeType} onChange={(event) => { setChangeType(event.target.value as typeof changeType); setTargetId('') }}><option value="room_unavailable">Room unavailable</option><option value="faculty_unavailable">Faculty unavailable</option><option value="remove_session">Remove session</option></select></label><label className="ops-field">{changeType === 'room_unavailable' ? 'Room' : changeType === 'faculty_unavailable' ? 'Faculty' : 'Session'}<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Select source ID</option>{(changeType === 'room_unavailable' ? roomIds : changeType === 'faculty_unavailable' ? facultyIds : sessions.map((item) => item.session_id)).map((id) => <option key={id} value={id}>{id}</option>)}</select></label>{changeType !== 'remove_session' && <><label className="ops-field">Days (comma separated)<input value={days} onChange={(event) => setDays(event.target.value)} placeholder="MON,TUE" /></label><label className="ops-field">Periods (comma separated)<input value={periods} onChange={(event) => setPeriods(event.target.value)} placeholder="2,3" /></label><label className="ops-field">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}<button className="ops-button primary" disabled={loading || !scheduleId || !targetId} onClick={() => void submit(makeManualChange())}>Preview repair</button></div></section>
    <section className="ops-card"><div className="ops-card-heading"><div><h2>Existing proposals</h2><p>Each proposal is tied to its own baseline schedule.</p></div></div>{loadedDatasetId !== selectedDatasetId ? null : proposals.length === 0 ? <div className="ops-empty"><ShieldAlert size={20}/><strong>No repair proposals</strong><span>Create a structured or parser-assisted proposal to inspect a potential schedule repair.</span></div> : <div className="ops-card-grid">{proposals.map((proposal) => <article className="ops-record-card" key={proposal.proposal_id}><header><h3>{proposal.status} proposal</h3><span className={`ops-badge ${proposal.status === 'approved' ? 'good' : proposal.status === 'rejected' ? 'bad' : ''}`}>{proposal.status}</span></header><p>{proposal.explanation}</p><p>Baseline: <span className="ops-mono">{proposal.baseline_schedule_id}</span></p><p>{proposal.affected_session_ids.length} affected · {proposal.changed_session_ids.length} changed</p><details><summary>Review proposed assignments and exam allocations</summary><pre className="ops-json">{JSON.stringify({ changes: proposal.changes, assignments: proposal.assignments, exams: proposal.exam_allocations }, null, 2)}</pre></details>{proposal.approved_schedule_id && <p>New schedule: <span className="ops-mono">{proposal.approved_schedule_id}</span></p>}{proposal.status === 'proposed' && <div className="ops-button-row"><button className="ops-button primary" disabled={loading} onClick={() => void decide(proposal, 'approve')}>Approve repair</button><button className="ops-button danger" disabled={loading} onClick={() => void decide(proposal, 'reject')}>Reject</button></div>}</article>)}</div>}</section>
  </div>
}
=======
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Bot, CircleDot, Clock3, GitCompareArrows, History, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { DisruptionRequestForm } from '../components/disruptions/DisruptionRequestForm'
import { loadDisruptionWorkspace } from '../api/disruptions'
import type { DisruptionWorkspaceView, ReschedulingProposalView } from '../types/disruption'

type LoadState = 'loading' | 'ready' | 'unavailable' | 'error'

function IntegrationState({ state, reason }: { state: LoadState; reason: string }) {
  if (state === 'loading') return <div className="disruption-panel-loading" role="status"><LoaderCircle size={15} className="disruption-spin" />Checking disruption integrations…</div>
  if (state === 'error') return <div className="disruption-panel-state is-error" role="alert"><AlertTriangle size={15} /><span>{reason}</span></div>
  if (state === 'unavailable') return <div className="disruption-panel-state"><AlertTriangle size={15} /><span>{reason}</span></div>
  return null
}

function ParsedResult({ workspace }: { workspace?: DisruptionWorkspaceView }) {
  const parsed = workspace?.parsed
  if (!parsed) return <div className="disruption-pending-content"><span className="disruption-pending-icon"><Bot size={18} /></span><strong>AI parsing is not connected</strong><p>Parsed disruption details will appear here only after Siddharth’s service returns them.</p></div>

  return <div className="disruption-parsed-details">
    {parsed.type && <div><span>Detected type</span><strong>{parsed.type}</strong></div>}
    {parsed.affectedLocations?.length ? <div><span>Affected locations</span><strong>{parsed.affectedLocations.join(', ')}</strong></div> : null}
    {parsed.timeWindow && <div><span>Time window</span><strong>{parsed.timeWindow}</strong></div>}
    {parsed.affectedResources?.length ? <div><span>Affected sessions or resources</span><strong>{parsed.affectedResources.join(', ')}</strong></div> : null}
    {parsed.confidence !== undefined && <div><span>AI confidence (as returned)</span><strong>{String(parsed.confidence)}</strong></div>}
    {parsed.clarificationRequired?.length ? <div className="disruption-clarification"><span>Clarification requested</span><strong>{parsed.clarificationRequired.join(', ')}</strong></div> : null}
  </div>
}

function ProposalComparison({ proposal }: { proposal: ReschedulingProposalView }) {
  return <article className="disruption-proposal-card">
    <header><div><GitCompareArrows size={15} /><strong>{proposal.title || `Proposal ${proposal.id}`}</strong></div>{proposal.feasibilityLabel && <span className="proposal-feasibility-label">{proposal.feasibilityLabel}</span>}</header>
    {proposal.changes.map((change, index) => <div className="proposal-change-comparison" key={`${proposal.id}-${index}`}>
      <section><span>BEFORE</span>{change.originalSession && <strong>{change.originalSession}</strong>}{change.resource && <strong>{change.resource}</strong>}<p>{change.originalDateTime || 'Time not supplied'}</p><p>{change.originalRoom || 'Room not supplied'}</p></section>
      <ArrowRight size={15} aria-hidden="true" />
      <section><span>PROPOSED</span>{change.proposedSession && <strong>{change.proposedSession}</strong>}<p>{change.proposedDateTime || 'Time not supplied'}</p><p>{change.proposedRoom || 'Room not supplied'}</p></section>
      {change.affectedGroups?.length ? <p className="proposal-groups">Affected groups: {change.affectedGroups.join(', ')}</p> : null}
    </div>)}
    {proposal.diagnostics?.length ? <div className="proposal-diagnostics">{proposal.diagnostics.map((diagnostic, index) => <div key={`${diagnostic.type}-${index}`}><AlertTriangle size={13} /><div><strong>{diagnostic.type}</strong>{diagnostic.affectedExamination && <span>Affected examination: {diagnostic.affectedExamination}</span>}{diagnostic.affectedResource && <span>Affected resource: {diagnostic.affectedResource}</span>}{diagnostic.explanation && <p>{diagnostic.explanation}</p>}</div></div>)}</div> : <p className="proposal-no-diagnostics">No solver diagnostics were supplied with this proposal.</p>}
    <p className="proposal-informational-note">Solver proposal only. It is not a confirmed timetable change.</p>
  </article>
}

export function DisruptionsPage() {
  const [state, setState] = useState<LoadState>('loading')
  const [reason, setReason] = useState('')
  const [workspace, setWorkspace] = useState<DisruptionWorkspaceView>()

  const refresh = useCallback(async () => {
    setState('loading')
    setReason('')
    try {
      const result = await loadDisruptionWorkspace()
      setWorkspace(result.status === 'ready' ? result.workspace : undefined)
      setState(result.status)
      if (result.status === 'unavailable') setReason(result.reason)
    } catch {
      setWorkspace(undefined)
      setState('error')
      setReason('Disruption workflow information could not be loaded. Check the connection and try again.')
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const proposals = workspace?.proposals ?? []
  const history = workspace?.history ?? []

  return (
    <div className="disruptions-page">
      <PageHeader
        className="disruptions-page-header"
        eyebrow="CAMPUS OPERATIONS"
        title="Disruption Management"
        description="Report campus disruptions and review schedule impacts."
        action={<button type="button" className="disruption-refresh-button" onClick={() => void refresh()} disabled={state === 'loading'}><RefreshCw size={14} className={state === 'loading' ? 'disruption-spin' : ''} /><span>Refresh</span></button>}
      />

      {state !== 'ready' && <div className={`disruption-state-banner is-${state}`} role={state === 'error' ? 'alert' : 'status'}>
        {state === 'loading' ? <LoaderCircle size={15} className="disruption-spin" /> : <AlertTriangle size={15} />}
        <span><strong>{state === 'loading' ? 'Loading workflow status' : state === 'error' ? 'Workflow status unavailable' : 'Disruption workflow integration pending'}</strong>{state !== 'loading' && <span> — {reason}</span>}</span>
      </div>}

      <section className="disruption-flow" aria-label="Disruption workflow stages">
        {[{ title: 'Report disruption', icon: FileWarningIcon, note: 'Description form' }, { title: 'AI interpretation', icon: Sparkles, note: 'Siddharth · pending' }, { title: 'Solver proposal', icon: Wrench, note: 'Niharika · pending' }, { title: 'Backend decision', icon: ShieldCheck, note: 'Dhruv · pending' }].map((step, index) => {
          const Icon = step.icon
          return <div className="disruption-flow-step" key={step.title}><span className="disruption-flow-icon"><Icon size={16} /></span><div><strong>{step.title}</strong><small>{step.note}</small></div>{index < 3 && <ArrowRight className="disruption-flow-arrow" size={14} aria-hidden="true" />}</div>
        })}
      </section>

      <div className="disruption-primary-grid">
        <section className="disruption-panel disruption-report-panel" aria-labelledby="disruption-report-heading">
          <div className="disruption-panel-heading"><div><span className="disruption-panel-icon"><FileWarningIcon size={16} /></span><div><p>STEP 01 · REPORT</p><h2 id="disruption-report-heading">Describe the disruption</h2></div></div><span className="disruption-integration-pill">Local form only</span></div>
          <p className="disruption-panel-description">Provide a clear description. Backend and AI fields will be added after their request contract is agreed.</p>
          <DisruptionRequestForm />
          <p className="disruption-form-boundary">Local validation does not check campus data, parse intent, or submit a request.</p>
        </section>

        <section className="disruption-panel" aria-labelledby="disruption-parsed-heading">
          <div className="disruption-panel-heading"><div><span className="disruption-panel-icon is-ai"><Bot size={16} /></span><div><p>STEP 02 · AI PARSING</p><h2 id="disruption-parsed-heading">Parsed disruption details</h2></div></div><span className="disruption-integration-pill">Siddharth</span></div>
          <IntegrationState state={state} reason={reason || 'AI parsing contract is not documented.'} />
          <ParsedResult workspace={state === 'ready' ? workspace : undefined} />
        </section>
      </div>

      <section className="disruption-panel disruption-proposals-panel" aria-labelledby="disruption-proposals-heading">
        <div className="disruption-panel-heading"><div><span className="disruption-panel-icon is-solver"><GitCompareArrows size={16} /></span><div><p>STEP 03 · RESCHEDULING</p><h2 id="disruption-proposals-heading">Solver proposals</h2></div></div><span className="disruption-integration-pill">Niharika</span></div>
        <IntegrationState state={state} reason={reason || 'Timetable rescheduling proposal contract is not documented.'} />
        {state === 'ready' && (proposals.length ? <div className="disruption-proposal-list">{proposals.map((proposal) => <ProposalComparison key={proposal.id} proposal={proposal} />)}</div> : <div className="disruption-empty-state"><GitCompareArrows size={19} /><strong>No proposals returned</strong><span>The solver has not supplied a rescheduling proposal for this disruption.</span></div>)}
      </section>

      <div className="disruption-secondary-grid">
        <section className="disruption-panel" aria-labelledby="disruption-decision-heading">
          <div className="disruption-panel-heading"><div><span className="disruption-panel-icon is-decision"><ShieldCheck size={16} /></span><div><p>STEP 04 · WORKFLOW</p><h2 id="disruption-decision-heading">Backend decision</h2></div></div><span className="disruption-integration-pill">Dhruv</span></div>
          <IntegrationState state={state} reason={reason || 'Workflow state and decision actions are not documented.'} />
          {state === 'ready' && <div className="disruption-workflow-data">{workspace?.workflowState ? <><CircleDot size={15} /><span>Backend workflow state: <strong>{workspace.workflowState}</strong></span></> : <p>No workflow state was returned. No decision action is available.</p>}</div>}
          <p className="disruption-panel-footnote">No approval or rejection controls are shown until Dhruv documents the supported workflow operation.</p>
        </section>
        <section className="disruption-panel" aria-labelledby="disruption-history-heading">
          <div className="disruption-panel-heading"><div><span className="disruption-panel-icon"><History size={16} /></span><div><p>ACTIVITY</p><h2 id="disruption-history-heading">Disruption history</h2></div></div></div>
          <IntegrationState state={state} reason={reason || 'Disruption history contract is not documented.'} />
          {state === 'ready' && (history.length ? <ol className="disruption-history-list">{history.map((item) => <li key={item.id}><span className="history-marker"><CircleDot size={12} /></span><div><strong>{item.statusLabel}</strong>{item.summary && <p>{item.summary}</p>}{item.updatedAt && <small><Clock3 size={11} />{item.updatedAt}</small>}</div></li>)}</ol> : <div className="disruption-empty-state"><History size={18} /><strong>No disruption history returned</strong><span>History appears when records are supplied by the backend.</span></div>)}
        </section>
      </div>

      <p className="disruption-authority-note"><ShieldCheck size={14} />AI parsing, schedule repair, diagnostics, and workflow decisions remain authoritative in their owning services. The frontend displays returned information only.</p>
    </div>
  )
}

function FileWarningIcon({ size = 16 }: { size?: number }) {
  return <AlertTriangle size={size} />
}
>>>>>>> 64ab278f5c5d108b4b2cf627cd460dc6ba75ba08
