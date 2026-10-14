import { ipcMain, type BrowserWindow } from 'electron'
import { createGuard } from './guard'
import type { UpdateController } from '../services/update-controller'
import type { Result } from '../../shared/contracts/app-api'
import type { UpdateSnapshot } from '../../shared/contracts/updater'
export function registerUpdater(controller: UpdateController, getWindow: () => BrowserWindow | null, expectedUrl: string): void {
  const allowed = createGuard(getWindow, expectedUrl)
  for (const action of ['snapshot', 'check', 'download', 'install'] as const) {
    ipcMain.handle(`updater:${action}`, async (event): Promise<Result<UpdateSnapshot>> => {
      if (!allowed(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'FORBIDDEN' } }
      try { return { ok: true, data: action === 'snapshot' ? controller.snapshot() : await controller[action]() } }
      catch (error) {
        const code = error instanceof Error && /^UPDATE_[A-Z_]+$/.test(error.message) ? error.message : 'UPDATE_CHECK_FAILED'
        return { ok: false, error: { code, message: code } }
      }
    })
  }
  // 与应用同生命周期，只注册一次；每个 renderer 订阅仍提供独立取消函数。
  controller.subscribe((state) => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('updater:event', state)
  })
}
