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
import { useAuth } from '../auth/AuthContext'
import { SmoothInput } from '../components/ui/SmoothInput'
import { SmoothTextarea } from '../components/ui/SmoothTextarea'

type Change = Record<string, unknown>
export function DisruptionsPage() {
  const { user } = useAuth()
  const { selectedDatasetId } = useDatasetContext()
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [assignments, setAssignments] = useState<ScheduleAssignments | null>(null)
  const [proposals, setProposals] = useState<RepairProposal[]>([])
  const [message, setMessage] = useState('')
  const [parsed, setParsed] = useState<AssistantResponse | null>(null)
  const [changeType, setChangeType] = useState<'room_unavailable' | 'faculty_unavailable' | 'remove_session'>('faculty_unavailable')
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
    <PageHeader eyebrow="DISRUPTION RESPONSE" title="Repair proposals" description="Describe a disruption and inspect the solver-generated repair proposal. Admin reviewers explicitly approve or reject changes." />
    <section className="ops-toolbar"><label className="ops-field">Baseline schedule<select value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}><option value="">Select schedule</option>{schedules.map((s) => <option key={s.schedule_id} value={s.schedule_id}>{new Date(s.created_at).toLocaleString()} · {s.status}</option>)}</select></label><button className="ops-button" onClick={() => void load(true)} disabled={loading}><RefreshCw size={14}/>Refresh</button></section>
    {error && <div className="ops-message error" role="alert"><AlertCircle size={15}/>{error}</div>}{notice && <div className="ops-message success" role="status">{notice}</div>}{dataLoading && loadedDatasetId === selectedDatasetId && <span className="skeleton-refresh" role="status"><span className="axiom-skeleton"/>Refreshing disruption records…</span>}
    {dataLoading && loadedDatasetId !== selectedDatasetId && <SkeletonPage label="Loading disruption workspace"><div className="ops-card-grid"><SkeletonCard/><SkeletonCard/><SkeletonCard/></div></SkeletonPage>}
    <section className="ops-card"><div className="ops-card-heading"><div><h2>Natural language request</h2><p>Parsing creates an interpretation only; this page submits a proposal for solver review.</p></div></div><div className="ops-fields"><label className="ops-field" style={{ flexBasis: '100%' }}>Disruption description<SmoothTextarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="For example: Room R204 is unavailable Monday during periods 2 and 3." /></label><button className="ops-button" type="button" disabled={loading || !message.trim()} onClick={() => void parsedChange()}>Parse request</button>{parsed?.proposal?.type === 'disruption' && <button className="ops-button primary" type="button" disabled={loading || !scheduleId} onClick={applyParsed}>Generate repair proposal</button>}</div>{parsed && <><p className="ops-inline-note">Parser status: {parsed.status}. Review the structured interpretation before continuing.</p>{parsed.missing_fields.length > 0 && <div className="ops-callout">Needs clarification: {parsed.missing_fields.join(', ')} {parsed.clarification?.question}</div>}<pre className="ops-json">{JSON.stringify(parsed.proposal?.data ?? parsed.extracted_entities, null, 2)}</pre></>}</section>
    <section className="ops-card"><div className="ops-card-heading"><div><h2>Structured disruption</h2><p>Use source IDs from the selected dataset. Changes remain proposals until approval.</p></div></div><div className="ops-fields"><label className="ops-field">Change type<select value={changeType} onChange={(event) => { setChangeType(event.target.value as typeof changeType); setTargetId('') }}>{user?.role === 'admin' && <option value="room_unavailable">Room unavailable</option>}<option value="faculty_unavailable">Faculty unavailable</option><option value="remove_session">Remove session</option></select></label><label className="ops-field">{changeType === 'room_unavailable' ? 'Room' : changeType === 'faculty_unavailable' ? 'Faculty' : 'Session'}<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Select source ID</option>{(changeType === 'room_unavailable' ? roomIds : changeType === 'faculty_unavailable' ? facultyIds : sessions.map((item) => item.session_id)).map((id) => <option key={id} value={id}>{id}</option>)}</select></label>{changeType !== 'remove_session' && <><label className="ops-field">Days (comma separated)<SmoothInput value={days} onChange={(event) => setDays(event.target.value)} placeholder="MON,TUE" /></label><label className="ops-field">Periods (comma separated)<SmoothInput value={periods} onChange={(event) => setPeriods(event.target.value)} placeholder="2,3" /></label><label className="ops-field">Reason<SmoothInput value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}<button className="ops-button primary" disabled={loading || !scheduleId || !targetId} onClick={() => void submit(makeManualChange())}>Preview repair</button></div></section>
    <section className="ops-card"><div className="ops-card-heading"><div><h2>Existing proposals</h2><p>Each proposal is tied to its own baseline schedule.</p></div></div>{loadedDatasetId !== selectedDatasetId ? null : proposals.length === 0 ? <div className="ops-empty"><ShieldAlert size={20}/><strong>No repair proposals</strong><span>Create a structured or parser-assisted proposal to inspect a potential schedule repair.</span></div> : <div className="ops-card-grid">{proposals.map((proposal) => <article className="ops-record-card" key={proposal.proposal_id}><header><h3>{proposal.status} proposal</h3><span className={`ops-badge ${proposal.status === 'approved' ? 'good' : proposal.status === 'rejected' ? 'bad' : ''}`}>{proposal.status}</span></header><p>{proposal.explanation}</p><p>Baseline: <span className="ops-mono">{proposal.baseline_schedule_id}</span></p><p>{proposal.affected_session_ids.length} affected · {proposal.changed_session_ids.length} changed</p><details><summary>Review proposed assignments and exam allocations</summary><pre className="ops-json">{JSON.stringify({ changes: proposal.changes, assignments: proposal.assignments, exams: proposal.exam_allocations }, null, 2)}</pre></details>{proposal.approved_schedule_id && <p>New schedule: <span className="ops-mono">{proposal.approved_schedule_id}</span></p>}{proposal.status === 'proposed' && user?.role === 'admin' && <div className="ops-button-row"><button className="ops-button primary" disabled={loading} onClick={() => void decide(proposal, 'approve')}>Approve repair</button><button className="ops-button danger" disabled={loading} onClick={() => void decide(proposal, 'reject')}>Reject</button></div>}</article>)}</div>}</section>
  </div>
}
