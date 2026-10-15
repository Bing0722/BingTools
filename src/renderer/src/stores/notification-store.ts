import { create } from 'zustand'
export interface Notice {
  id: string; key: string; level: 'info' | 'error'; time: number; count: number; read: boolean; expires: number
}
interface NotificationState {
  items: Notice[]; toasts: Notice[]
  push: (key: string, level?: Notice['level'], important?: boolean) => void
  dismiss: (id: string) => void
  markRead: () => void
  clear: () => void
}
/** 保留消息代码而非翻译文本，切换语言后已有通知也随之更新。 */
export const useNotifications = create<NotificationState>((set) => ({
  items: [], toasts: [],
  push: (key, level = 'info', important = level === 'error') => set((state) => {
    // 普通操作由控件状态反馈；只有重要事件和错误才打扰用户。
    if (!important && level !== 'error') return state
    const now = Date.now()
    const previous = [...state.items, ...state.toasts].find((entry) => entry.key === key && now - entry.time < 5000)
    const entry: Notice = previous
      ? { ...previous, count: previous.count + 1, time: now, expires: now + 5000, read: false }
      : { id: crypto.randomUUID(), key, level, time: now, count: 1, expires: now + 5000, read: false }
    return {
      items: important ? [entry, ...state.items.filter((item) => item.id !== entry.id)].slice(0, 100) : state.items,
      toasts: [entry, ...state.toasts.filter((item) => item.id !== entry.id && item.expires > now)].slice(0, 3),
    }
  }),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  markRead: () => set((state) => ({ items: state.items.map((item) => ({ ...item, read: true })) })),
  clear: () => set({ items: [], toasts: [] }),
}))
