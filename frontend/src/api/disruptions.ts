import type { DisruptionWorkspaceResult } from '../types/disruption'

const unavailableReason =
  'Disruption parsing, solver proposals, and workflow history are not available through documented API contracts yet.'

/** No disruption API request is made until the AI, solver, and backend contracts are agreed. */
export async function loadDisruptionWorkspace(): Promise<DisruptionWorkspaceResult> {
  return { status: 'unavailable', reason: unavailableReason }
}
