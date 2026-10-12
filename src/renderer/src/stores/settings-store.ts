import { create } from 'zustand'
import type { Preferences, SettingsPatch } from '../../../shared/schemas/settings'
import { defaultSettings, preferencesOf } from '../../../shared/schemas/settings'

interface SettingsState {
  preferences: Preferences
  ready: boolean
  saving: boolean
  error?: string
  warning?: string
  load: () => Promise<void>
  update: (patch: SettingsPatch) => Promise<boolean>
}
export const useSettings = create<SettingsState>((set, get) => ({
  preferences: preferencesOf(defaultSettings), ready: false, saving: false,
  load: async () => {
    try {
      const result = await window.app.settings.get()
      if (!result.ok) throw new Error(result.error.message)
      set({ ...result.data, ready: true, error: undefined })
    } catch {
      set({ ready: true, error: '无法连接本地设置服务，请重新加载。' })
    }
  },
  update: async (patch) => {
    if (get().saving) return false
    set({ saving: true, error: undefined })
    try {
      const result = await window.app.settings.update(patch)
      if (!result.ok) { set({ error: result.error.message, saving: false }); return false }
      set({ ...result.data, saving: false })
      return true
    } catch {
      set({ error: '本地服务暂时不可用，设置未保存，请重试。', saving: false })
      return false
    }
  },
}))
