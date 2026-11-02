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
    set({ saving: true, savingLayout: Object.keys(patch).every((key) => ['sidebarCollapsed', 'sidebarWidth'].includes(key)), error: undefined })
    try {
      const result = await window.app.settings.update(patch)
      if (!result.ok) { set({ error: result.error.code, saving: false, savingLayout: false }); useNotifications.getState().push(result.error.code, 'error'); return false }
      set({ ...result.data, saving: false, savingLayout: false })
      return true
    } catch {
      set({ error: 'CONNECTION_FAILED', saving: false, savingLayout: false })
      useNotifications.getState().push('CONNECTION_FAILED', 'error')
      return false
    }
  },
}))
