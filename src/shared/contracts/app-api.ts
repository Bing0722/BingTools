import type { Preferences, SettingsPatch } from '../schemas/settings'

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
export interface SettingsSnapshot {
  preferences: Preferences
  warning?: string
}
export interface AppApi {
  platform: 'darwin' | 'win32' | 'linux'
  settings: {
    get(): Promise<Result<SettingsSnapshot>>
    update(patch: SettingsPatch): Promise<Result<SettingsSnapshot>>
  }
}
