/**
 * 更新共享展示副本：标题栏与设置页使用同一订阅，关闭面板不取消主进程任务。
 */
import { create } from 'zustand'
import type { UpdateSnapshot } from '../../../shared/contracts/updater'
import type { Result } from '../../../shared/contracts/app-api'
import { useNotifications } from './notification-store'

// 标题栏和设置页共用展示状态，避免重复订阅和并发检查。
export const useUpdates = create<{
  snapshot?: UpdateSnapshot
  error?: string
  pending: boolean
}>(() => ({ pending: false }))
function apply(value: UpdateSnapshot) {
  // 检查进度事件可能先于命令返回值到达，以 revision 保住较新的展示状态。
  const current = useUpdates.getState().snapshot
  if (!current || value.revision >= current.revision) useUpdates.setState({ snapshot: value })
}
export function connectUpdates() {
  let alive = true
  const unsubscribe = window.app.updater.onEvent((value) => { if (alive) apply(value) })
  void window.app.updater.getSnapshot().then((result) => {
    if (!alive) return
    if (result.ok) apply(result.data)
    else useUpdates.setState({ error: result.error.code })
  }).catch(() => { if (alive) useUpdates.setState({ error: 'UPDATE_CONNECTION_FAILED' }) })
  return () => { alive = false; unsubscribe() }
}
export async function runUpdate(operation: () => Promise<Result<UpdateSnapshot>>) {
  // 标题栏和设置页共用互斥标记，不能各自并发触发同一更新操作。
  if (useUpdates.getState().pending) return
  useUpdates.setState({ pending: true, error: undefined })
  try {
    const result = await operation()
    if (!result.ok) throw new Error(result.error.code)
    apply(result.data)
    if (result.data.error) throw new Error(result.data.error)
    if (['available', 'current', 'downloaded'].includes(result.data.phase)) useNotifications.getState().push(result.data.mode === 'demo' ? result.data.phase === 'downloaded' ? 'updateDemoComplete' : 'updateDemoAvailable' : `update_${result.data.phase}`, 'info', result.data.mode === 'github' && result.data.phase !== 'current')
  } catch (failure) {
    const code = failure instanceof Error && /^UPDATE_[A-Z_]+$/.test(failure.message) ? failure.message : 'UPDATE_CONNECTION_FAILED'
    useUpdates.setState({ error: code }); useNotifications.getState().push(code, 'error')
  } finally { useUpdates.setState({ pending: false }) }
}
