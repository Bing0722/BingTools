/**
 * 设置展示副本：通过有限 API 读取和保存，保存成功后才采用主进程返回的偏好。
 */
import { create } from 'zustand'
import { useNotifications } from './notification-store'
import type { Preferences, SettingsPatch } from '../../../shared/schemas/settings'
import { defaultSettings, preferencesOf } from '../../../shared/schemas/settings'

interface SettingsState {
  preferences: Preferences
  ready: boolean
  savingLayout: boolean
  saving: boolean
  error?: string
  warning?: string
  systemLocale?: string
  load: () => Promise<void>
  update: (patch: SettingsPatch) => Promise<boolean>
}
export const useSettings = create<SettingsState>((set, get) => ({
  preferences: preferencesOf(defaultSettings), ready: false, saving: false, savingLayout: false,
  load: async () => {
    try {
      const result = await window.app.settings.get()
      if (!result.ok) throw new Error(result.error.code)
      set({ ...result.data, ready: true, error: undefined })
    } catch {
      set({ ready: true, error: 'CONNECTION_FAILED' })
    }
  },
  update: async (patch) => {
    if (get().saving) {
      if (!get().savingLayout) return false
      // 侧栏保存期间其他偏好保持可交互，等待当前写入，避免吞掉点击。
      await new Promise<void>((resolve) => {
        const unsubscribe = useSettings.subscribe((state) => { if (!state.saving) { unsubscribe(); resolve() } })
      })
      return get().update(patch)
    }
    // 布局保存单独标记，侧栏变化只影响相关控件；其他偏好仍通过同一个更新入口保存。
    set({ saving: true, savingLayout: Object.keys(patch).every((key) => ['sidebarCollapsed', 'sidebarWidth'].includes(key)), error: undefined })
    try {
      const result = await window.app.settings.update(patch)
      if (!result.ok) { set({ error: result.error.code, saving: false, savingLayout: false }); useNotifications.getState().push(result.error.code, 'error'); return false }
      // 采用主进程返回的结果，失败时保留原偏好，避免界面显示未落盘的设置。
      set({ ...result.data, saving: false, savingLayout: false })
      return true
    } catch {
      set({ error: 'CONNECTION_FAILED', saving: false, savingLayout: false })
      useNotifications.getState().push('CONNECTION_FAILED', 'error')
      return false
    }
  },
}))
