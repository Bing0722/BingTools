import { create } from 'zustand'
import { defaultMotionConfig, SERIAL_LOG_LIMIT, type MotionCommand, type MotionEvent, type MotionLog, type MotionState } from '../../../shared/schemas/motion'
import { useNotifications } from './notification-store'
interface State {
  state: MotionState; logs: MotionLog[]; ready: boolean; busy: boolean; error?: string
  apply: (event: MotionEvent) => void; run: (command: MotionCommand) => Promise<boolean>
}
export const useMotion = create<State>((set, get) => ({
  state: { revision: -1, config: defaultMotionConfig, phase: 'stopped', customerId: null }, logs: [], ready: false, busy: false,
  apply: (event) => {
    if (event.type === 'state') {
      if (event.state.revision < get().state.revision) return
      if (event.state.error && event.state.error !== get().state.error) useNotifications.getState().push(event.state.error, 'error')
      if (event.state.warning && event.state.warning !== get().state.warning) useNotifications.getState().push(event.state.warning, 'error')
      set({ state: event.state })
    } else if (event.type === 'clear') set({ logs: get().logs.filter((v) => v.id > event.throughId || (event.customerId !== null && v.customerId !== event.customerId)) })
    else {
      // 快照可能已包含待发送批次；以递增 ID 去重，不漏掉订阅初始化期间的数据。
      const entries = new Map(get().logs.map((v) => [v.id, v]))
      for (const entry of event.entries) entries.set(entry.id, entry)
      set({ logs: [...entries.values()].sort((a, b) => a.id - b.id).slice(-SERIAL_LOG_LIMIT) })
    }
  },
  run: async (command) => {
    if (get().busy) return false
    set({ busy: true, error: undefined })
    try {
      const result = await window.app.motion.command(command)
      if (!result.ok) throw new Error(result.error.code)
      const { revision, config, phase, customerId, error, warning } = result.data
      get().apply({ type: 'state', state: { revision, config, phase, customerId, error, warning } })
      return true
    } catch (error) {
      const code = error instanceof Error ? error.message : 'CONNECTION_FAILED'
      set({ error: code }); useNotifications.getState().push(code, 'error'); return false
    } finally { set({ busy: false }) }
  },
}))
export function connectMotion() {
  let alive = true, ready = false
  const events: MotionEvent[] = []
  const dispose = window.app.motion.onEvent((event) => {
    if (!alive) return
    if (ready) useMotion.getState().apply(event)
    else { events.push(event); if (events.length > 200) events.shift() }
  })
  void window.app.motion.getSnapshot().then((result) => {
    if (!alive) return
    if (!result.ok) throw new Error(result.error.code)
    const { logs, ...state } = result.data
    useMotion.setState({ logs, ready: true, error: undefined })
    useMotion.getState().apply({ type: 'state', state })
    ready = true
    for (const event of events) useMotion.getState().apply(event)
  }).catch(() => { ready = true; if (alive) useMotion.setState({ ready: true, error: 'CONNECTION_FAILED' }) })
  return () => { alive = false; dispose() }
}

export async function reloadMotion() {
  try {
    const result = await window.app.motion.getSnapshot()
    if (!result.ok) throw new Error(result.error.code)
    const { logs, ...state } = result.data
    useMotion.getState().apply({ type: 'state', state })
    useMotion.getState().apply({ type: 'logs', entries: logs })
    useMotion.setState({ error: undefined })
  } catch { useNotifications.getState().push('CONNECTION_FAILED', 'error') }
}
