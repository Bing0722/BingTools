/**
 * 页面与预加载层共用的 API 契约；这里只定义类型，实际安全校验仍在主进程执行。
 */
import type { AiImportOptions } from '../ai-import'
import type { TransferExport, TransferModule, TransferPreview } from '../schemas/transfer'
import type { MotionCommand, MotionEvent, MotionSnapshot, MotionState, SerialPortInfo } from '../schemas/motion'
import type { UpdateSnapshot } from './updater'
import type { Preferences, SettingsPatch } from '../schemas/settings'
import type { CustomerInput, Endpoint } from '../schemas/simulator'
import type { SimulatorEvent, SimulatorSnapshot } from './simulator'
// 用 ok 区分成功数据和业务错误；code 用于页面翻译，不跨进程传递原始异常对象。
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
export interface SettingsSnapshot { preferences: Preferences; warning?: string; systemLocale?: string }
export interface AppApi {
  platform: 'darwin' | 'win32' | 'linux'
  // choose 仅产生预览，apply 才保存；返回 null 或 false 可表示用户取消原生文件对话框。
  transfer: {
    copyAiPrompt(options: AiImportOptions): Promise<Result<null>>
    choose(module: TransferModule): Promise<Result<TransferPreview | null>>
    apply(input: { token: string; customerId?: string }): Promise<Result<null>>
    discard(): Promise<Result<null>>
    export(input: TransferExport): Promise<Result<boolean>>
  }
  settings: {
    get(): Promise<Result<SettingsSnapshot>>
    update(patch: SettingsPatch): Promise<Result<SettingsSnapshot>>
  }
  updater: {
    getSnapshot(): Promise<Result<UpdateSnapshot>>
    check(): Promise<Result<UpdateSnapshot>>
    openRelease(): Promise<Result<UpdateSnapshot>>
    download(): Promise<Result<UpdateSnapshot>>
    install(): Promise<Result<UpdateSnapshot>>
    // 订阅返回取消函数；调用方应在对应生命周期结束时执行，避免重复接收事件。
    onEvent(listener: (snapshot: UpdateSnapshot) => void): () => void
  }
  motion: {
    getSnapshot(): Promise<Result<MotionSnapshot>>
    listPorts(): Promise<Result<SerialPortInfo[]>>
    command(command: MotionCommand): Promise<Result<MotionState>>
    onEvent(listener: (event: MotionEvent) => void): () => void
  }
  simulator: {
    getSnapshot(): Promise<Result<SimulatorSnapshot>>
    saveCustomer(customer: CustomerInput, sourceCustomerId?: string): Promise<Result<SimulatorSnapshot>>
    deleteCustomer(customerId: string): Promise<Result<SimulatorSnapshot>>
    selectCustomer(customerId: string): Promise<Result<SimulatorSnapshot>>
    saveEndpoint(customerId: string, endpoint: Endpoint): Promise<Result<SimulatorSnapshot>>
    reorderEndpoints(customerId: string, endpointIds: string[]): Promise<Result<SimulatorSnapshot>>
    deleteEndpoint(customerId: string, endpointId: string): Promise<Result<SimulatorSnapshot>>
    setEndpointEnabled(customerId: string, endpointId: string, enabled: boolean): Promise<Result<SimulatorSnapshot>>
    start(customerId: string): Promise<Result<SimulatorSnapshot>>
    stop(): Promise<Result<SimulatorSnapshot>>
    clearLogs(customerId: string | null): Promise<Result<SimulatorSnapshot>>
    onEvent(listener: (event: SimulatorEvent) => void): () => void
  }
}
