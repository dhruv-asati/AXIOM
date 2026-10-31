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
