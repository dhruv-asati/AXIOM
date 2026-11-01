export type AssistantMemoryItem = { id: string; kind: string; label: string; value: string; updatedAt: number }
export type AssistantMemoryState = { items: AssistantMemoryItem[]; enabled: boolean }
export function getAssistantMemoryKey(userId: string | null | undefined, datasetId: string | null | undefined): string
export function clearAssistantMemorySession(storage?: Storage): void
export function readAssistantMemory(storage: Storage, key: string, now?: number): AssistantMemoryState
export function rememberAssistantContext(existing: AssistantMemoryItem[], options: { text: string; mode: 'booking' | 'disruption'; department?: string; now?: number; idFactory?: () => string }): AssistantMemoryItem[]
export function removeAssistantMemoryItem(items: AssistantMemoryItem[], id: string): AssistantMemoryItem[]
