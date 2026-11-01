export type TeamMember = { name: string; image: string; description?: string }

// The repository contains no team photos yet. Keep real teammate names and use
// visibly documented local avatar placeholders until photos are supplied.
export const PLACEHOLDER_TEAM_MEMBERS: TeamMember[] = [
  { name: 'Dhruv Asati', image: '/images/team/dhruv-placeholder.svg' },
  { name: 'Om', image: '/images/team/om-placeholder.svg' },
  { name: 'Niharika', image: '/images/team/niharika-placeholder.svg' },
  { name: 'Siddharth', image: '/images/team/siddharth-placeholder.svg' },
  { name: 'Team member 05', image: '/images/team/member-05-placeholder.svg' },
  { name: 'Team member 06', image: '/images/team/member-06-placeholder.svg' },
  { name: 'Team member 07', image: '/images/team/member-07-placeholder.svg' },
  { name: 'Team member 08', image: '/images/team/member-08-placeholder.svg' },
]

/** Role illustrations and capability summaries shown on the sign-in page. */
export const AXIOM_ROLE_PROFILES: TeamMember[] = [
  {
    name: 'Admin',
    image: '/images/roles/admin.svg',
    description: 'Oversee datasets, campus schedules, venue operations and system-wide activity from one workspace.',
  },
  {
    name: 'Coordinator',
    image: '/images/roles/coordinator.svg',
    description: 'Coordinate department rooms, booking requests, examinations and schedule changes.',
  },
  {
    name: 'Faculty',
    image: '/images/roles/faculty.svg',
    description: 'Review teaching schedules, assigned rooms and student groups, and raise disruption requests.',
  },
  {
    name: 'Club Representative',
    image: '/images/roles/club-representative.svg',
    description: 'Request campus venues for club activities and follow booking decisions and updates.',
  },
]
