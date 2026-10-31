/** Frontend view model only; API_CONTRACTS.md does not define this wire schema. */
export type ExaminationConflict = {
  type: string
  affectedExamination?: string
  affectedResource?: string
  explanation?: string
}

export type ExaminationRoomAllocation = {
  roomId: string
  roomName: string
  building?: string
  capacity?: number
  assignedAttendance?: number
  /** Displayed verbatim only when supplied by the solver/backend. */
  allocationStatus?: string
}

export type ExaminationView = {
  id: string
  name: string
  courseCode?: string
  courseName?: string
  department?: string
  date?: string
  startTime?: string
  endTime?: string
  studentGroups?: string[]
  expectedAttendance?: number
  invigilators?: string[]
  examinationType?: string
  roomAllocations?: ExaminationRoomAllocation[]
  /** Rendered only when supplied by the official solver/backend. */
  conflicts?: ExaminationConflict[]
}

export type ExaminationLoadResult =
  | { status: 'ready'; examinations: ExaminationView[] }
  | { status: 'unavailable'; examinations: []; reason: string }
