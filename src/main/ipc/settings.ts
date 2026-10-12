import { ipcMain, nativeTheme, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { preferencesOf, settingsPatchSchema } from '../../shared/schemas/settings'
import type { Result, SettingsSnapshot } from '../../shared/contracts/app-api'
import type { SettingsRepository } from '../storage/settings-repository'
import { isTrustedUrl } from './trusted-source'

export function registerSettings(repository: SettingsRepository, getWindow: () => BrowserWindow | null, expectedUrl: string): void {
  function allowed(event: IpcMainInvokeEvent): boolean {
    const window = getWindow()
    return !!window && !window.isDestroyed() && event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && isTrustedUrl(event.senderFrame.url, expectedUrl)
  }
  function snapshot(): Result<SettingsSnapshot> {
    return { ok: true, data: { preferences: preferencesOf(repository.get()), warning: repository.warning } }
  }
  ipcMain.handle('settings:get', (event): Result<SettingsSnapshot> => {
    if (!allowed(event)) return { ok: false, error: { code: 'FORBIDDEN', message: '此页面不能访问应用设置。' } }
    return snapshot()
  })
  ipcMain.handle('settings:update', async (event, patch: unknown): Promise<Result<SettingsSnapshot>> => {
    if (!allowed(event)) return { ok: false, error: { code: 'FORBIDDEN', message: '此页面不能修改应用设置。' } }
    const parsed = settingsPatchSchema.safeParse(patch)
    if (!parsed.success) return { ok: false, error: { code: 'INVALID_INPUT', message: '设置值无效，请重新选择。' } }
    try {
      await repository.update(parsed.data)
      if (parsed.data.theme) nativeTheme.themeSource = parsed.data.theme
      return snapshot()
    } catch {
      return { ok: false, error: { code: 'SAVE_FAILED', message: '设置未保存，请检查磁盘空间或文件权限后重试。' } }
    }
  })
}
