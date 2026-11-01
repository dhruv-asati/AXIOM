const MAX_ITEMS = 16
const MAX_AGE_MS = 4 * 60 * 60 * 1000

export function getAssistantMemoryKey(userId, datasetId) {
  return `axiom.assistantMemory.${encodeURIComponent(userId || 'anonymous')}.${encodeURIComponent(datasetId || 'no-dataset')}`
}

export function clearAssistantMemorySession(storage) {
  try {
    const target = storage ?? globalThis.sessionStorage
    for (let index = target.length - 1; index >= 0; index -= 1) {
      const key = target.key(index)
      if (key?.startsWith('axiom.assistantMemory.')) target.removeItem(key)
    }
  } catch { /* Storage can be unavailable in private browsing. */ }
}

export function readAssistantMemory(storage, key, now = Date.now()) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '{}')
    const items = Array.isArray(parsed.items) ? parsed.items.filter((item) => item && typeof item.id === 'string'
      && typeof item.kind === 'string' && typeof item.label === 'string' && typeof item.value === 'string'
      && Number.isFinite(item.updatedAt) && now - item.updatedAt < MAX_AGE_MS).slice(-MAX_ITEMS) : []
    return { items, enabled: parsed.enabled !== false }
  } catch { return { items: [], enabled: true } }
}

const clean = (value) => value.replace(/\b(password|passcode|token|secret|api[ _-]?key|credential)\b\s*[:=]?\s*\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 90)

function toItem(kind, label, value, now, idFactory) {
  const safeValue = clean(value)
  return safeValue ? { id: idFactory(), kind, label, value: safeValue, updatedAt: now } : null
}

export function rememberAssistantContext(existing, { text, mode, department = '', now = Date.now(), idFactory = () => globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random()}` }) {
  const input = clean(String(text || ''))
  if (!input) return existing.slice(-MAX_ITEMS)
  const normalized = input.toLocaleLowerCase()
  const kind = mode === 'booking' ? 'Current task' : 'Current task'
  const taskName = mode === 'booking' ? 'Drafting a venue booking' : 'Preparing a schedule change'
  const additions = [toItem(kind, 'Task', taskName, now, idFactory)]
  const topic = normalized.includes('spectra') ? 'Spectra event'
    : normalized.includes('timetable') || normalized.includes('schedule') ? 'Timetable and scheduling'
      : normalized.includes('booking') || normalized.includes('venue') || normalized.includes('room') ? 'Venue booking'
        : normalized.includes('faculty') || normalized.includes('session') || normalized.includes('reschedule') ? 'Schedule change'
          : 'General request'
  additions.push(toItem('topic', 'Recent topic', topic, now, idFactory))
  if (department) additions.push(toItem('department', 'Department', department, now, idFactory))

  const patterns = [
    ['organization', 'Organization', /\b([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)?\s+(?:Club|Society))\b/],
    ['room', 'Room', /\b(?:room|lab|venue)\s+([A-Z0-9][A-Z0-9-]{1,15})\b/i],
    ['faculty', 'Faculty', /\b((?:Dr\.?|Prof\.?)\s+[A-Z][\w.'-]+(?:\s+[A-Z][\w.'-]+){0,2})\b/],
    ['group', 'Student group', /\b(?:group|section)\s+([A-Z0-9][A-Z0-9 _-]{1,24}?)(?=\s+(?:on|during|because|for|at)\b|[,.!?]|$)/i],
    ['department', 'Department', /\bdepartment\s+([A-Z][A-Z0-9&-]{1,19})\b/i],
    ['date', 'Date', /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i],
    ['time', 'Time range', /\b(?:from\s+)?\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*(?:to|–|-)\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)?/i],
    ['preference', 'Preference', /\b(?:prefer|please keep|always use)\s+([^.!?]{2,70})/i],
  ]
  for (const [itemKind, label, pattern] of patterns) {
    const match = input.match(pattern)
    if (match) additions.push(toItem(itemKind, label, match[1] || match[0], now, idFactory))
  }

  const merged = [...existing.filter((item) => !additions.some((addition) => addition && addition.kind === item.kind && addition.value.toLocaleLowerCase() === item.value.toLocaleLowerCase())), ...additions.filter(Boolean)]
  return merged.slice(-MAX_ITEMS)
}

export function removeAssistantMemoryItem(items, id) {
  return items.filter((item) => item.id !== id)
}
