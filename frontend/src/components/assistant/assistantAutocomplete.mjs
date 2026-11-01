const bookingRoles = new Set(['admin', 'department_coordinator', 'club_representative'])

function memoryValue(memory, kinds) {
  return [...memory].reverse().find((item) => kinds.includes(item.kind))?.value || ''
}

function unique(suggestions) {
  return [...new Map(suggestions.filter((item) => item.text.trim()).map((item) => [item.text.toLocaleLowerCase(), item])).values()].slice(0, 3)
}

export function getAssistantAutocompleteSuggestions(input, mode, role, memory = []) {
  const query = input.trim()
  if (query.length < 2) return []
  const lower = query.toLocaleLowerCase()
  const followUp = /\b(now|same|again|there|it|that|those)\b/.test(lower)
  const entity = memoryValue(memory, ['organization', 'group', 'room', 'faculty', 'department', 'topic'])
  const rememberedDate = memoryValue(memory, ['date'])
  const rememberedTime = memoryValue(memory, ['time']).replace(/^from\s+/i, '')
  const suggestions = []

  if (mode === 'booking' && bookingRoles.has(role)) {
    const isVenueIntent = /\b(book|booking|venue|room|event|club|spectra)\b/.test(lower)
    if (isVenueIntent) {
      const subject = /\bspectra\b/i.test(query) ? 'Spectra' : memoryValue(memory, ['organization']) || '[event name]'
      const base = query.replace(/[.\s]+$/, '')
      const needsDay = !/\b(on\s+\w+|20\d{2}-\d{2}-\d{2})\b/i.test(base)
      const needsTime = !/\b(from\s+\S+|\d{1,2}:\d{2})\b/i.test(base)
      const needsAttendance = !/\b\d+\s*(people|attendees|students|guests)\b/i.test(base)
      const needsRequirements = !/\b(requirements?|equipment|projector|accessible|microphone|whiteboard)\b/i.test(base)
      const missing = [needsDay ? 'on [day]' : '', needsTime ? 'from [start time] to [end time]' : '', needsAttendance ? 'for [attendee count] people' : ''].filter(Boolean)
      const text = `${base}${missing.length ? ` ${missing.join(' ')}` : ''}${needsRequirements ? '. Room needs: [requirements]' : ''}.`.replace(/\.\.$/, '.')
      suggestions.push({ id: 'booking-completion', text, detail: `Complete the venue request${subject !== '[event name]' ? ` for ${subject}` : ''}.`, mode: 'booking', icon: 'booking' })
    }
    if (followUp && entity) suggestions.push({ id: 'booking-context', text: `Request another venue booking for ${entity} on ${rememberedDate || '[day]'} ${rememberedTime ? `from ${rememberedTime}` : 'from [start time] to [end time]'} for [attendee count] people.`, detail: 'Uses remembered context as a draft; review before parsing.', mode: 'booking', icon: 'context' })
  }

  if (mode === 'disruption') {
    const isDisruptionIntent = /\b(room|lab|faculty|teacher|session|class|reschedul|unavailable|closed|repair|change)\b/.test(lower) || followUp
    if (isDisruptionIntent) {
      const room = memoryValue(memory, ['room'])
      const faculty = memoryValue(memory, ['faculty'])
      const rememberedDate = memoryValue(memory, ['date'])
      const rememberedTime = memoryValue(memory, ['time']).replace(/^from\s+/i, '')
      const text = /\bfaculty|teacher\b/.test(lower)
        ? `${query.replace(/[.\s]+$/, '')} on [day] during periods [periods] because [reason].`
        : /\bsession|class|reschedul/.test(lower)
          ? `${query.replace(/[.\s]+$/, '')} on [day] because [reason].`
          : `${query.replace(/[.\s]+$/, '')} on [day] during periods [periods] because [reason].`
      suggestions.push({ id: 'disruption-completion', text, detail: 'Complete the disruption details for the existing parser.', mode: 'disruption', icon: 'disruption' })
      if (followUp && (room || faculty)) {
        const remembered = room || faculty
        suggestions.push({ id: 'disruption-context', text: `Report a scheduling disruption involving ${remembered} on ${rememberedDate || '[day]'} during ${rememberedTime ? `the ${rememberedTime} time range` : 'periods [periods]'} because [reason].`, detail: 'Uses session-only context as a draft; review before parsing.', mode: 'disruption', icon: 'context' })
      }
    }
  }

  return unique(suggestions)
}
