import { ipcMain, type BrowserWindow } from 'electron'
import { simulatorCommandSchema } from '../../shared/schemas/simulator'
import type { SimulatorController } from '../services/simulator-controller'
import type { Result } from '../../shared/contracts/app-api'
import type { SimulatorSnapshot } from '../../shared/contracts/simulator'
import { createGuard } from './guard'
export function registerSimulator(controller: SimulatorController, getWindow: () => BrowserWindow | null, expectedUrl: string): void {
  const allowed = createGuard(getWindow, expectedUrl)
  const fail = (code: string): Result<SimulatorSnapshot> => ({ ok: false, error: { code, message: code } })
  ipcMain.handle('simulator:snapshot', (event): Result<SimulatorSnapshot> => allowed(event) ? { ok: true, data: controller.snapshot() } : fail('FORBIDDEN'))
  ipcMain.handle('simulator:command', async (event, input: unknown): Promise<Result<SimulatorSnapshot>> => {
    if (!allowed(event)) return fail('FORBIDDEN')
    const parsed = simulatorCommandSchema.safeParse(input)
    if (!parsed.success) return fail('INVALID_INPUT')
    try { return { ok: true, data: await controller.execute(parsed.data) } }
    catch (error) { return fail(error instanceof Error ? error.message : 'SERVER_ERROR') }
  })
  controller.subscribe((event) => {
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('simulator:event', event)
  })
}
