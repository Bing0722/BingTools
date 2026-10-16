import { create } from 'zustand'

type LogView = { collapsed: boolean; paused: boolean; query: string; filter: string; scrollTop: number }
type LogPage = 'simulator' | 'motion'
const defaults = (): LogView => ({ collapsed: false, paused: false, query: '', filter: 'all', scrollTop: 0 })
// 仅保留当前 renderer 会话的视图状态，页面卸载不清空；不持久化日志或表单草稿。
export const useLogViews = create<{
  simulator: LogView
  motion: LogView
  update: (page: LogPage, patch: Partial<LogView>) => void
}>((set) => ({
  simulator: defaults(), motion: defaults(),
  update: (page, patch) => set((state) => ({ [page]: { ...state[page], ...patch } })),
}))
