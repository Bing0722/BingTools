import { app, ipcMain, nativeTheme, type BrowserWindow } from 'electron'
import { preferencesOf, settingsPatchSchema, type AppSettings } from '../../shared/schemas/settings'
import type { Result, SettingsSnapshot } from '../../shared/contracts/app-api'
import type { SettingsRepository } from '../storage/settings-repository'
import { createGuard } from './guard'
export function registerSettings(repository: SettingsRepository, getWindow: () => BrowserWindow | null, expectedUrl: string, onChange: (settings: AppSettings) => void): void {
  const allowed = createGuard(getWindow, expectedUrl)
  const fail = (code: string): Result<SettingsSnapshot> => ({ ok: false, error: { code, message: code } })
  function snapshot(): Result<SettingsSnapshot> {
    return { ok: true, data: { preferences: preferencesOf(repository.get()), warning: repository.warning, systemLocale: app.getLocale() } }
  }
  ipcMain.handle('settings:get', (event): Result<SettingsSnapshot> => allowed(event) ? snapshot() : fail('FORBIDDEN'))
  ipcMain.handle('settings:update', async (event, patch: unknown): Promise<Result<SettingsSnapshot>> => {
    if (!allowed(event)) return fail('FORBIDDEN')
    const parsed = settingsPatchSchema.safeParse(patch)
    if (!parsed.success) return fail('INVALID_INPUT')
    try {
      const settings = await repository.update(parsed.data)
      if (parsed.data.theme) nativeTheme.themeSource = parsed.data.theme
      onChange(settings)
      return snapshot()
    } catch { return fail('SAVE_FAILED') }
  })
}
