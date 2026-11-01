import type { UserRole } from '../../auth/AuthContext'
import type { AssistantMemoryItem } from '../../lib/assistantMemory.mjs'
export type AssistantAutocompleteSuggestion = { id: string; text: string; detail: string; mode: 'booking' | 'disruption'; icon: 'booking' | 'disruption' | 'context' }
export function getAssistantAutocompleteSuggestions(input: string, mode: 'booking' | 'disruption', role: UserRole, memory?: AssistantMemoryItem[]): AssistantAutocompleteSuggestion[]
