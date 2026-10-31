import { apiRequest } from './client'
import type {
  AssistantResponse, BookingRequestRecord, DatasetCalendar, ExaminationRecord,
  RepairProposal, RoomRecord, ScheduleAssignments, ScheduleSummary,
} from '../types/api'

export type TimetableGeneration = {
  schedule_id: string
  status: 'optimal' | 'feasible'
  scheduled_sessions: number
  scheduled_exams: number
  soft_total: number
  exam_soft_penalty: number
  solver_objective: number
  best_objective_bound: number
  solve_time_seconds: number
}

export function listSchedules(datasetId: string, signal?: AbortSignal) {
  return apiRequest<ScheduleSummary[]>(`/datasets/${datasetId}/schedules`, { signal })
}

export function getAssignments(datasetId: string, scheduleId: string, filters: Record<string, string> = {}, signal?: AbortSignal) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
  return apiRequest<ScheduleAssignments>(`/datasets/${datasetId}/schedules/${scheduleId}/assignments${query.size ? `?${query}` : ''}`, { signal })
}

export function generateTimetable(datasetId: string, warmStartScheduleId?: string) {
  return apiRequest<TimetableGeneration>(`/datasets/${datasetId}/schedules/generate`, {
    method: 'POST', body: JSON.stringify({ team: 'AXIOM', time_limit_seconds: 120, warm_start_schedule_id: warmStartScheduleId ?? null }),
  })
}

export function listExaminations(datasetId: string, scheduleId: string, signal?: AbortSignal) {
  return apiRequest<{ dataset_id: string; schedule_id: string; examinations: ExaminationRecord[] }>(`/datasets/${datasetId}/schedules/${scheduleId}/examinations`, { signal })
}

export function listRooms(datasetId: string, options: Record<string, string | number | boolean | undefined>, signal?: AbortSignal) {
  const query = new URLSearchParams()
  Object.entries(options).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)) })
  return apiRequest<RoomRecord[]>(`/datasets/${datasetId}/rooms${query.size ? `?${query}` : ''}`, { signal })
}

export function listBookings(datasetId: string, scheduleId?: string, signal?: AbortSignal) {
  const query = scheduleId ? `?schedule_id=${encodeURIComponent(scheduleId)}` : ''
  return apiRequest<BookingRequestRecord[]>(`/datasets/${datasetId}/bookings${query}`, { signal })
}

export function runBookingEngine(datasetId: string, scheduleId: string) {
  return apiRequest<{ counts: { approved: number; rejected: number; pending: number } }>(`/datasets/${datasetId}/schedules/${scheduleId}/bookings/run`, { method: 'POST' })
}

export function parseBooking(message: string, requester: { requester: string; role: 'admin' | 'department_coordinator' | 'faculty' | 'club'; department?: string }) {
  return apiRequest<AssistantResponse>('/assistant/bookings/parse', {
    method: 'POST', body: JSON.stringify({ message, requester }),
  })
}

export function parseDisruption(message: string) {
  return apiRequest<AssistantResponse>('/assistant/disruptions/parse', { method: 'POST', body: JSON.stringify({ message }) })
}

export function submitBooking(datasetId: string, data: Record<string, unknown>, rawText: string, sourceId: string) {
  return apiRequest<BookingRequestRecord>(`/datasets/${datasetId}/booking-requests`, {
    method: 'POST', body: JSON.stringify({ data, raw_text: rawText, source_id: sourceId }),
  })
}

export function cancelBookingRequest(datasetId: string, requestId: string, reason: string) {
  return apiRequest<void>(`/datasets/${datasetId}/bookings/${encodeURIComponent(requestId)}/cancel`, {
    method: 'POST', body: JSON.stringify({ reason }),
  })
}

export type DepartmentLabBooking = {
  request_id: string; requester: string; title: string; department: string
  attendance: number; duration_periods: number
  windows: Array<{ day: string; from_period: number; to_period: number }>
  room_types: string[]; needs: string[]; mandatory_for_groups: string[]
  created_by_user_id: string | null; status: 'pending'
}

export type ClassMoveApproval = {
  proposal_id: string; request_id: string; baseline_schedule_id: string
  repair_proposal_id: string; room_id: string; day: string
  start_period: number; end_period: number; status: 'proposed' | 'approved' | 'rejected'
  reason: string | null; created_at: string; decided_at: string | null
  created_by_user_id: string | null; decided_by_user_id: string | null
  approved_schedule_id: string | null; changes: unknown[]
  assignments: Array<{ session_id: string; day: string; start_period: number; room_id: string }>
  changed_session_ids: string[]; explanation: string
  before: Array<{ session_id: string; day: string; start_period: number; room_id: string }>
  request: { title: string; requester: string; attendance: number } | null
}

export function listDepartmentLabBookings(datasetId: string, scheduleId: string, signal?: AbortSignal) {
  return apiRequest<DepartmentLabBooking[]>(`/datasets/${datasetId}/schedules/${scheduleId}/department-lab-bookings`, { signal })
}

export function decideDepartmentLabBooking(datasetId: string, scheduleId: string, requestId: string, decision: 'approve' | 'reject', details: { room_id?: string; day?: string; start_period?: number; reason?: string }) {
  return apiRequest<{ request_id: string; status: string; reason: string; decided_at: string }>(`/datasets/${datasetId}/schedules/${scheduleId}/bookings/${encodeURIComponent(requestId)}/department-lab-decision`, {
    method: 'POST', body: JSON.stringify({ decision, ...details }),
  })
}

export function createBookingClassMoveProposal(datasetId: string, requestId: string, details: { schedule_id: string; room_id: string; day: string; start_period: number }) {
  return apiRequest<ClassMoveApproval>(`/datasets/${datasetId}/bookings/${encodeURIComponent(requestId)}/class-move-proposals`, {
    method: 'POST', body: JSON.stringify({ ...details, time_limit_seconds: 60 }),
  })
}

export function listClassMoveProposals(datasetId: string, signal?: AbortSignal) {
  return apiRequest<ClassMoveApproval[]>(`/datasets/${datasetId}/class-move-proposals`, { signal })
}

export function decideClassMoveProposal(datasetId: string, proposalId: string, decision: 'approve' | 'reject', reason?: string) {
  return apiRequest<{ proposal_id: string; status: string; reason: string; approved_schedule_id?: string }>(`/datasets/${datasetId}/class-move-proposals/${proposalId}/decision`, {
    method: 'POST', body: JSON.stringify({ decision, reason }),
  })
}

export function assignRoomDepartment(datasetId: string, roomId: string, department: string | null) {
  return apiRequest<{ room_id: string; department: string | null }>(`/datasets/${datasetId}/rooms/${encodeURIComponent(roomId)}/department`, {
    method: 'PUT', body: JSON.stringify({ department }),
  })
}

export function updatePriorityOrder(datasetId: string, priorityOrder: string[]) {
  return apiRequest<{ dataset_id: string; priority_order: string[] }>(`/datasets/${datasetId}/priority-order`, {
    method: 'PUT', body: JSON.stringify({ priority_order: priorityOrder }),
  })
}

export function resetDemoData(datasetId: string) {
  return apiRequest<{ dataset_id: string; status: string; preserved: string[] }>(`/datasets/${datasetId}/demo-reset`, { method: 'POST' })
}

export function listRepairProposals(datasetId: string, signal?: AbortSignal) {
  return apiRequest<RepairProposal[]>(`/datasets/${datasetId}/repair-proposals`, { signal })
}

export function createRepairProposal(datasetId: string, scheduleId: string, changes: unknown[]) {
  return apiRequest<RepairProposal>(`/datasets/${datasetId}/schedules/${scheduleId}/repair-proposals`, {
    method: 'POST', body: JSON.stringify({ changes, time_limit_seconds: 60 }),
  })
}

export function decideRepair(datasetId: string, scheduleId: string, proposalId: string, action: 'approve' | 'reject', reason = 'Rejected in AXIOM') {
  return apiRequest<RepairProposal>(`/datasets/${datasetId}/schedules/${scheduleId}/repair-proposals/${proposalId}/${action}`, {
    method: 'POST', ...(action === 'reject' ? { body: JSON.stringify({ reason }) } : {}),
  })
}

export type { DatasetCalendar }
