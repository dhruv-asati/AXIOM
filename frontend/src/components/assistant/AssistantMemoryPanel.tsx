import { useState } from 'react'
import { Brain, Check, EyeOff, RotateCcw, Trash2, X } from 'lucide-react'
import type { AssistantMemoryItem } from '../../lib/assistantMemory.mjs'

type Props = {
  items: AssistantMemoryItem[]
  enabled: boolean
  onToggle: (enabled: boolean) => void
  onRemove: (id: string) => void
  onClear: () => void
}

export function AssistantMemoryPanel({ items, enabled, onToggle, onRemove, onClear }: Props) {
  const [open, setOpen] = useState(false)
  return <section className="assistant-memory" aria-label="Conversation context">
    <div className="assistant-memory-bar">
      <span className={`assistant-memory-indicator${enabled ? ' is-enabled' : ''}`}><Brain size={14} aria-hidden="true" />{enabled ? 'Context active' : 'Context paused'}{enabled && items.length > 0 && <small>{items.length}</small>}</span>
      <span className="assistant-memory-scope">This tab only · clears on sign out</span>
      <button type="button" className="assistant-memory-toggle" onClick={() => onToggle(!enabled)} aria-pressed={enabled}>{enabled ? <><EyeOff size={13} />Pause</> : <><RotateCcw size={13} />Resume</>}</button>
      <button type="button" className="assistant-memory-toggle" aria-expanded={open} aria-controls="assistant-memory-panel" onClick={() => setOpen((current) => !current)}>Details</button>
    </div>
    {open && <div className="assistant-memory-panel" id="assistant-memory-panel">
      <div className="assistant-memory-panel-heading"><div><strong>Session context</strong><small>{enabled ? 'Used only to tailor draft suggestions.' : 'Saved context is not used while paused.'}</small></div><button type="button" className="assistant-memory-icon-button" aria-label="Close context details" onClick={() => setOpen(false)}><X size={14} /></button></div>
      {!items.length ? <p className="assistant-memory-empty">Context appears here after you parse a request. No full conversation transcript is retained.</p> : <ul className="assistant-memory-list">{items.map((item) => <li key={item.id}><span><small>{item.label}</small><strong>{item.value}</strong></span><button type="button" aria-label={`Remove ${item.label}: ${item.value}`} onClick={() => onRemove(item.id)}><X size={13} /></button></li>)}</ul>}
      <div className="assistant-memory-panel-footer"><button type="button" className="assistant-memory-clear" disabled={!items.length} onClick={onClear}><Trash2 size={13} />Clear context</button><span><Check size={12} />Temporary browser-tab memory</span></div>
    </div>}
  </section>
}
