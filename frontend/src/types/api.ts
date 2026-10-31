export type DatasetSummary = {
  id: string
  source_dataset_id: string
  institute: string
  created_at: string
}

export type DatasetDetail = DatasetSummary & {
  calendar: DatasetCalendar
  priority_order: string[]
  role_category_cap: Record<string, string>
}

export type DatasetCalendar = {
  days: string[]
  periods: Array<{ id: number; start?: string; end?: string; teaching?: boolean }>
  lunch?: { after_period?: number }
  exam_week?: { days?: string[]; sessions?: Array<{ id: string }> }
}

export type DatasetStats = {
  faculty: number
  student_groups: number
  courses: number
  rooms: number
  timetable_sessions: number
  examinations: number
  booking_requests: number
}

export type ScheduleSummary = {
  schedule_id: string
  source_id: string
  team: string
  created_at: string
  status: 'complete' | 'incomplete'
  assignment_count: number
  examination_count: number
}

export type TimetableAssignment = {
  session_id: string
  course_id: string
  course_name: string
  department: string
  year: number
  kind: 'lecture' | 'tutorial' | 'lab' | string
  duration: number
  faculty_id: string
  faculty_name: string
  day: string
  start_period: number
  end_period: number
  room_id: string
  room_name: string
  student_groups: Array<{ id: string; name: string }>
}

export type ScheduleAssignments = {
  dataset_id: string
  schedule_id: string
  status: 'complete' | 'incomplete'
  assignments: TimetableAssignment[]
}

export type BookingRequestRecord = {
  request_id: string
  submitted_at: string
  requester: string
  role: string
  department: string | null
  requested_category: string
  effective_category: string
  priority_rank: number
  title: string
  attendance: number
  duration_periods: number
  windows: Array<{ day: string; from_period: number; to_period: number }>
  room_types: string[]
  needs: string[]
  requested_room: string | null
  mandatory_for_groups: string[]
  cancelled: boolean
  status: 'approved' | 'rejected' | 'alternative_offered' | 'pending'
  day: string | null
  start_period: number | null
  end_period: number | null
  room_id: string | null
  reason: string | null
  created_by_user_id: string | null
}

export type RoomRecord = {
  room_id: string
  name: string
  building: string
  room_type: string
  department: string | null
  capacity: number
  features: string[]
  accessible: boolean
  allowed_uses: string[]
  availability: 'available' | 'occupied' | 'unavailable' | 'not_checked'
  scheduled_periods: number
  unavailable_periods: number
  utilization_percent: number | null
}

export type ExaminationRecord = {
  exam_id: string
  course_ids: string[]
  course_names: string[]
  group_ids: string[]
  group_names: string[]
  expected_attendance: number
  day: string | null
  session: string | null
  rooms: Array<{ room_id: string; name: string; capacity: number; effective_capacity: number }>
  effective_allocated_capacity: number
}

export type RepairProposal = {
  proposal_id: string
  dataset_id: string
  baseline_schedule_id: string
  approved_schedule_id: string | null
  status: 'proposed' | 'approved' | 'rejected'
  changes: Array<Record<string, unknown>>
  assignments: Array<{ session_id: string; day: string; start_period: number; room_id: string }>
  exam_allocations: Array<{ exam_id: string; day: string; session: string; rooms: string[] }>
  affected_session_ids: string[]
  changed_session_ids: string[]
  objective: Record<string, unknown>
  explanation: string
  created_at: string
  decided_at: string | null
}

export type AssistantResponse = {
  intent: 'booking' | 'disruption' | 'unknown'
  status: 'clarification_required' | 'proposal_ready' | 'unsupported' | 'error'
  extracted_entities: Record<string, unknown>
  missing_fields: string[]
  clarification?: { id: string; question: string; fields: string[] } | null
  proposal?: { type: 'booking' | 'disruption'; data: Record<string, unknown> } | null
  assumptions: string[]
  warnings: Array<{ code: string; message: string }>
  error?: { code: string; message: string } | null
}

export type DashboardSummary = {
  dataset_id: string
  source_dataset_id: string
  institute: string
  counts: DatasetStats
  schedule_count: number
  latest_schedule: ScheduleSummary | null
  booking_counts: { approved: number; rejected: number; alternative_offered: number; pending: number }
  room_utilisation_percent: number | null
  room_utilisation_definition: string
  upcoming_sessions: Array<Pick<TimetableAssignment, 'session_id' | 'course_name' | 'faculty_name' | 'day' | 'start_period' | 'end_period' | 'room_name' | 'room_id'>>
  recent_repair_proposals: Array<{ proposal_id: string; status: string; created_at: string; explanation: string }>
}
