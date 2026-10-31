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
