/**
 * 服务器共享展示状态：接收权威快照和增量日志，用 revision 避免旧结果覆盖新状态。
 */
import { create } from 'zustand'
import type { SimulatorEvent, SimulatorSnapshot } from '../../../shared/contracts/simulator'
import type { Result } from '../../../shared/contracts/app-api'
import { defaultSimulatorConfig } from '../../../shared/schemas/simulator'
import { useNotifications } from './notification-store'
const initial: SimulatorSnapshot = { revision: -1, config: defaultSimulatorConfig, runtime: { phase: 'stopped' }, logs: [] }
interface State {
  snapshot: SimulatorSnapshot; ready: boolean; busy: boolean; pendingToggle?: string; pendingListener?: boolean; error?: string
  apply: (snapshot: SimulatorSnapshot) => void
  receive: (event: SimulatorEvent) => void
  run: (operation: () => Promise<Result<SimulatorSnapshot>>, success?: string, pendingToggle?: string, pendingListener?: boolean) => Promise<boolean>
}
export const useSimulator = create<State>((set, get) => ({
  snapshot: initial, ready: false, busy: false,
  apply: (snapshot) => {
    // IPC 命令返回值和事件可能交错抵达，只接受不旧于当前展示版本的快照。
    if (snapshot.revision < get().snapshot.revision) return
    if (snapshot.warning && snapshot.warning !== get().snapshot.warning) useNotifications.getState().push(snapshot.warning, 'error')
    set({ snapshot, ready: true })
  },
  receive: (event) => {
    if (event.type === 'snapshot') get().apply(event.snapshot)
    else {
      set((state) => event.revision > state.snapshot.revision ? { snapshot: { ...state.snapshot, revision: event.revision, logs: [...state.snapshot.logs, event.entry].slice(-1000) } } : {})
      // 请求逐条进入日志，只有生命周期与服务异常进入全局通知。
      if (!event.entry.method && event.entry.code !== 'BAD_REQUEST') useNotifications.getState().push(event.entry.code, event.entry.level === 'error' ? 'error' : 'info', true)
    }
  },
  run: async (operation, success, pendingToggle, pendingListener) => {
    if (get().busy) return false
    // busy 阻止命令重入；pendingToggle/pendingListener 让页面只给正在保存的控件忙碌反馈。
    set({ busy: true, pendingToggle, pendingListener, error: undefined })
    try {
      const result = await operation()
      if (!result.ok) throw new Error(result.error.code)
      get().apply(result.data)
      if (success) useNotifications.getState().push(success)
      return true
    } catch (error) {
      const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'CONNECTION_FAILED'
      set({ error: code }); useNotifications.getState().push(code, 'error'); return false
    } finally { set({ busy: false, pendingToggle: undefined, pendingListener: false }) }
  },
}))
/** 先订阅并缓冲，快照完成后按顺序补齐，避免首次加载丢掉刚到达的请求。 */
export function connectSimulator(): () => void {
  let alive = true
  let initialized = false
  const buffer: SimulatorEvent[] = []
  const unsubscribe = window.app.simulator.onEvent((event) => {
    if (!alive) return
    if (!initialized) { buffer.push(event); if (buffer.length > 1000) buffer.shift() }
    else useSimulator.getState().receive(event)
  })
  void window.app.simulator.getSnapshot().then((result) => {
    if (!alive) return
    if (!result.ok) throw new Error(result.error.code)
    useSimulator.getState().apply(result.data)
    initialized = true
    for (const event of buffer) useSimulator.getState().receive(event)
  }).catch(() => {
    initialized = true
    buffer.length = 0
    if (alive) { useSimulator.setState({ ready: true, error: 'CONNECTION_FAILED' }); useNotifications.getState().push('CONNECTION_FAILED', 'error') }
  })
  // 取消事件监听之外，还用 alive 阻止已发出但尚未返回的快照更新已卸载的页面环境。
  return () => { alive = false; unsubscribe() }
}
