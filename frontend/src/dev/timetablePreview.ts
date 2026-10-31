import type { TimetableSession } from '../types/timetable'

/**
 * Development-only display fixture based on examples/schedule.example.json.
 * The source file explicitly says it is not a real solution. These assignments
 * are never returned in production builds or presented as a live timetable.
 */
export const timetablePreview: TimetableSession[] = [
  {
    id: 'MA101-AB-L1', day: 'MON', startPeriod: 2, durationPeriods: 1,
    courseCode: 'MA101', courseName: 'Calculus and Linear Algebra', department: 'MA',
    facultyId: 'F19', facultyName: 'Dr. Shalini Gupta', roomId: 'LH-1', roomName: 'Lecture Hall 1',
    studentGroups: [
      { id: 'Y1-A', name: 'B.Tech Year 1, Section A' },
      { id: 'Y1-B', name: 'B.Tech Year 1, Section B' },
    ],
    kind: 'lecture',
  },
  {
    id: 'PH191-A-P1', day: 'TUE', startPeriod: 6, durationPeriods: 3,
    courseCode: 'PH191', courseName: 'Physics Laboratory', department: 'PH',
    facultyId: 'F23', facultyName: 'Dr. Farah Khan', roomId: 'PHY-LAB', roomName: 'Physics Lab',
    studentGroups: [{ id: 'Y1-A', name: 'B.Tech Year 1, Section A' }],
    kind: 'lab',
  },
  {
    id: 'OE301-L1', day: 'WED', startPeriod: 3, durationPeriods: 1,
    courseCode: 'OE301', courseName: 'Introduction to Finance', department: 'HSS',
    facultyId: 'F39', facultyName: 'Dr. Radhika Hegde', roomId: 'LH-3', roomName: 'Lecture Hall 3',
    studentGroups: ['CSE-3', 'ECE-3', 'EE-3', 'ME-3', 'CE-3'].map((id) => ({ id, name: `${id.slice(0, -2)} Year 3` })),
    kind: 'lecture',
  },
  {
    id: 'OE302-L1', day: 'WED', startPeriod: 3, durationPeriods: 1,
    courseCode: 'OE302', courseName: 'Data Visualisation', department: 'CSE',
    facultyId: 'F05', facultyName: 'Dr. Meera Nair', roomId: 'LH-5', roomName: 'Lecture Hall 5',
    studentGroups: ['CSE-3', 'ECE-3', 'EE-3', 'ME-3', 'CE-3'].map((id) => ({ id, name: `${id.slice(0, -2)} Year 3` })),
    kind: 'lecture',
  },
  {
    id: 'OE303-L1', day: 'WED', startPeriod: 3, durationPeriods: 1,
    courseCode: 'OE303', courseName: 'Technical Writing', department: 'HSS',
    facultyId: 'F40', facultyName: 'Dr. Om Prakash Sahu', roomId: 'CR-101', roomName: 'Classroom A-101',
    studentGroups: ['CSE-3', 'ECE-3', 'EE-3', 'ME-3', 'CE-3'].map((id) => ({ id, name: `${id.slice(0, -2)} Year 3` })),
    kind: 'lecture',
  },
]
