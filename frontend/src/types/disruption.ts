/** Frontend display models only; no disruption API payload schema is agreed. */
export type DisruptionDiagnosticView = {
  type: string
  affectedExamination?: string
  affectedResource?: string
  explanation?: string
}

export type ScheduleChangeView = {
  resource?: string
  originalSession?: string
  proposedSession?: string
  originalDateTime?: string
  proposedDateTime?: string
  originalRoom?: string
  proposedRoom?: string
  affectedGroups?: string[]
}

export type ReschedulingProposalView = {
  id: string
  title?: string
  changes: ScheduleChangeView[]
  diagnostics?: DisruptionDiagnosticView[]
  feasibilityLabel?: string
}

export type ParsedDisruptionView = {
  type?: string
  affectedLocations?: string[]
  timeWindow?: string
  affectedResources?: string[]
  confidence?: number
  clarificationRequired?: string[]
}

export type DisruptionHistoryView = {
  id: string
  statusLabel: string
  summary?: string
  updatedAt?: string
}

export type DisruptionWorkspaceView = {
  parsed?: ParsedDisruptionView
  proposals?: ReschedulingProposalView[]
  workflowState?: string
  history?: DisruptionHistoryView[]
}

export type DisruptionWorkspaceResult =
  | { status: 'ready'; workspace: DisruptionWorkspaceView }
  | { status: 'unavailable'; reason: string }
