import { create } from 'zustand'
import { useNotifications } from './notification-store'
import type { Preferences, SettingsPatch } from '../../../shared/schemas/settings'
import { defaultSettings, preferencesOf } from '../../../shared/schemas/settings'

interface SettingsState {
  preferences: Preferences
  ready: boolean
  saving: boolean
  error?: string
  warning?: string
  systemLocale?: string
  load: () => Promise<void>
  update: (patch: SettingsPatch) => Promise<boolean>
}
export const useSettings = create<SettingsState>((set, get) => ({
  preferences: preferencesOf(defaultSettings), ready: false, saving: false,
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
    if (get().saving) return false
    set({ saving: true, error: undefined })
    try {
      const result = await window.app.settings.update(patch)
      if (!result.ok) { set({ error: result.error.code, saving: false }); useNotifications.getState().push(result.error.code, 'error'); return false }
      set({ ...result.data, saving: false })
      return true
    } catch {
      set({ error: 'CONNECTION_FAILED', saving: false })
      useNotifications.getState().push('CONNECTION_FAILED', 'error')
      return false
    }
  },
}))
