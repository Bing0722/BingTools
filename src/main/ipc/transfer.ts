/**
 * 导入导出入口：主进程选择文件，工作线程处理正文，页面只接收摘要与预览凭证。
 */
import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { transferApplySchema, transferExportSchema, transferModuleSchema, type TransferData } from '../../shared/schemas/transfer'
import { createTransfer, transferPreview } from '../services/transfer-data'
import type { SimulatorController } from '../services/simulator-controller'
import type { MotionController } from '../services/motion-controller'
import { createGuard } from './guard'

function fileTask(action: 'read' | 'write', path: string, data?: TransferData): Promise<TransferData | null> {
  return new Promise((resolve, reject) => {
    // 每个文件任务使用独立线程；结果只返回校验后的数据或稳定错误码。
    const worker = new Worker(join(__dirname, 'transfer-worker.js'), { workerData: { action, path, data } })
    worker.once('message', (result) => result.ok ? resolve(result.data) : reject(new Error(result.error)))
    worker.once('error', () => reject(new Error('TRANSFER_INVALID')))
    worker.once('exit', (code) => { if (code !== 0) reject(new Error('TRANSFER_INVALID')) })
  })
}
export function registerTransfer(simulator: SimulatorController, motion: MotionController, getWindow: () => BrowserWindow | null, expectedUrl: string) {
  const allowed = createGuard(getWindow, expectedUrl)
  const watched = new WeakSet<BrowserWindow>()
  let busy = false
  // 预览绑定窗口和随机 token，页面无法提交任意正文替换已预览内容。
  let pending: { token: string; data: TransferData; owner: BrowserWindow } | undefined
  const fail = (code: string) => ({ ok: false, error: { code, message: code } })
  const filters = [{ name: 'BingTools JSON', extensions: ['json'] }]
  function stopped(module: 'simulator' | 'motion') {
    const phase = module === 'simulator' ? simulator.snapshot().runtime.phase : motion.state().phase
    if (['starting', 'running', 'stopping'].includes(phase)) throw new Error('STOP_FIRST')
  }
  ipcMain.handle('transfer:choose', async (event, input: unknown) => {
    if (!allowed(event)) return fail('FORBIDDEN')
    const parsed = transferModuleSchema.safeParse(input)
    if (!parsed.success) return fail('INVALID_INPUT')
    if (busy) return fail('TRANSFER_BUSY')
    busy = true; pending = undefined
    try {
      stopped(parsed.data)
      const owner = getWindow()!
      const selected = await dialog.showOpenDialog(owner, { filters, properties: ['openFile'] })
      if (selected.canceled || !selected.filePaths[0]) return { ok: true, data: null }
      const data = await fileTask('read', selected.filePaths[0])
      if (!data) throw new Error('TRANSFER_INVALID')
      // 原生对话框与文件读取期间窗口可能变化，异步完成后再次校验调用来源。
      if (!allowed(event)) return fail('FORBIDDEN')
      if (data.module !== parsed.data) throw new Error('TRANSFER_MODULE')
      pending = { token: randomUUID(), data, owner }
      // 每个窗口只保留一份预览，关闭窗口后释放配置正文。
      if (!watched.has(owner)) {
        watched.add(owner)
        owner.once('closed', () => { if (pending?.owner === owner) pending = undefined })
      }
      return { ok: true, data: transferPreview(data, pending.token) }
    } catch (error) { return fail(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'TRANSFER_READ_FAILED') }
    finally { busy = false }
  })
  ipcMain.handle('transfer:apply', async (event, input: unknown) => {
    if (!allowed(event)) return fail('FORBIDDEN')
    const parsed = transferApplySchema.safeParse(input)
    if (!parsed.success) return fail('INVALID_INPUT')
    if (busy) return fail('TRANSFER_BUSY')
    // 提交必须使用当前窗口仍有效的预览，重新选文件或成功导入后旧 token 失效。
    if (!pending || pending.token !== parsed.data.token || pending.owner !== getWindow()) return fail('TRANSFER_EXPIRED')
    busy = true
    try {
      const { data } = pending
      stopped(data.module)
      if (data.scope === 'interfaces' && !parsed.data.customerId) throw new Error('CUSTOMER_NOT_FOUND')
      if (data.module === 'simulator') await simulator.importData(data, parsed.data.customerId)
      else await motion.importData(data, parsed.data.customerId)
      pending = undefined
      return { ok: true, data: null }
    } catch (error) { return fail(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'TRANSFER_INVALID') }
    finally { busy = false }
  })
  ipcMain.handle('transfer:discard', (event) => {
    if (!allowed(event)) return fail('FORBIDDEN')
    if (!busy) pending = undefined
    return { ok: true, data: null }
  })
  ipcMain.handle('transfer:export', async (event, input: unknown) => {
    if (!allowed(event)) return fail('FORBIDDEN')
    const parsed = transferExportSchema.safeParse(input)
    if (!parsed.success) return fail('INVALID_INPUT')
    if (busy) return fail('TRANSFER_BUSY')
    busy = true
    try {
      const data = createTransfer(parsed.data, simulator.snapshot().config, motion.state().config)
      const selected = await dialog.showSaveDialog(getWindow()!, { filters, defaultPath: `BingTools-${data.module}-${data.scope}.json` })
      if (selected.canceled || !selected.filePath) return { ok: true, data: false }
      if (!allowed(event)) return fail('FORBIDDEN')
      await fileTask('write', selected.filePath, data)
      return { ok: true, data: true }
    } catch (error) { return fail(error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'TRANSFER_WRITE_FAILED') }
    finally { busy = false }
  })
}
