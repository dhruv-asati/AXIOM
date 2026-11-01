import { useCallback, useEffect, useMemo, useState } from 'react'
import { getAssistantMemoryKey, readAssistantMemory, rememberAssistantContext, removeAssistantMemoryItem, type AssistantMemoryItem } from '../lib/assistantMemory.mjs'

function sessionStorageOrNull(): Storage | null {
  try { return window.sessionStorage } catch { return null }
}

export function useAssistantMemory(userId: string | undefined, datasetId: string, department?: string | null) {
  const key = useMemo(() => getAssistantMemoryKey(userId, datasetId), [datasetId, userId])
  const initial = useMemo(() => {
    const storage = sessionStorageOrNull()
    return storage ? readAssistantMemory(storage, key) : { items: [], enabled: true }
  }, [])
  const [items, setItems] = useState<AssistantMemoryItem[]>(initial.items)
  const [enabled, setEnabledState] = useState(initial.enabled)
  const [loadedKey, setLoadedKey] = useState(key)

  useEffect(() => {
    const storage = sessionStorageOrNull()
    const state = storage ? readAssistantMemory(storage, key) : { items: [], enabled: true }
    setItems(state.items)
    setEnabledState(state.enabled)
    setLoadedKey(key)
  }, [key])

  useEffect(() => {
    if (loadedKey !== key) return
    const storage = sessionStorageOrNull()
    if (!storage) return
    try { storage.setItem(key, JSON.stringify({ items, enabled })) } catch { /* Memory remains available in React state for this visit. */ }
  }, [enabled, items, key, loadedKey])

  const remember = useCallback((text: string, mode: 'booking' | 'disruption') => {
    if (!enabled) return
    setItems((current) => rememberAssistantContext(current, { text, mode, department: department ?? '' }))
  }, [department, enabled])
  const remove = useCallback((id: string) => setItems((current) => removeAssistantMemoryItem(current, id)), [])
  const clear = useCallback(() => setItems([]), [])
  const setEnabled = useCallback((next: boolean) => setEnabledState(next), [])

  const ready = loadedKey === key
  return { items: ready ? items : [], enabled: ready && enabled, setEnabled, remember, remove, clear, ready }
}
