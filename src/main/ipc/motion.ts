import { ipcMain, type BrowserWindow } from 'electron'
import { motionCommandSchema } from '../../shared/schemas/motion'
import type { MotionController } from '../services/motion-controller'
import { createGuard } from './guard'
export function registerMotion(controller: MotionController, getWindow: () => BrowserWindow | null, expectedUrl: string) {
  const allowed = createGuard(getWindow, expectedUrl)
  const fail = (code: string) => ({ ok: false, error: { code, message: code } })
  ipcMain.handle('motion:snapshot', (event) => allowed(event) ? { ok: true, data: controller.snapshot() } : fail('FORBIDDEN'))
  ipcMain.handle('motion:ports', async (event) => {
    if (!allowed(event)) return fail('FORBIDDEN')
    try { return { ok: true, data: await controller.listPorts() } } catch { return fail('MOTION_LIST_FAILED') }
  })
  ipcMain.handle('motion:command', async (event, input: unknown) => {
    if (!allowed(event)) return fail('FORBIDDEN')
    const parsed = motionCommandSchema.safeParse(input)
    if (!parsed.success) return fail('INVALID_INPUT')
    try { return { ok: true, data: await controller.execute(parsed.data) } } catch (error) { return fail(error instanceof Error ? error.message : 'MOTION_SERIAL_ERROR') }
  })
  controller.subscribe((event) => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('motion:event', event)
  })
}
