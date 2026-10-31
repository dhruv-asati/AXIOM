export const timetableDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

export type TimetableDay = string
export type SessionKind = 'lecture' | 'tutorial' | 'lab' | 'other'

/** Frontend display model. This is not the unresolved backend response schema. */
export type TimetableConflict = {
  type: string
  description?: string
  affectedRoom?: string
  affectedFaculty?: string
}

export type TimetableSession = {
  id: string
  day: TimetableDay
  startPeriod: number
  durationPeriods: number
  courseCode: string
  courseName: string
  department: string
  facultyId: string
  facultyName: string
  roomId: string
  roomName: string
  studentGroups: Array<{ id: string; name: string }>
  kind: SessionKind
  timeLabel?: string
  /** Populated only from official solver/backend diagnostics after a contract is agreed. */
  conflicts?: TimetableConflict[]
}

export type TimetableLoadResult =
  | { status: 'preview'; sessions: TimetableSession[] }
  | { status: 'unavailable'; sessions: []; reason: string }

