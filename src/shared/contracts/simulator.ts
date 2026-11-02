/**
 * 服务器跨进程数据契约：持久化配置、临时运行状态与内存日志在快照中组合传递。
 */
import type { SimulatorConfig } from '../schemas/simulator'
export type LogLevel = 'info' | 'warn' | 'error'
// 请求/响应字段可选，因为服务启停等事件也使用同一日志结构。
export interface LogEntry {
  id: string; time: number; customerId: string; customerName: string; level: LogLevel; code: string
  method?: string; path?: string; status?: number; duration?: number
  requestHeaders?: Record<string, string>
  requestPreview?: string; responsePreview?: string
  requestTruncated?: boolean; responseTruncated?: boolean
}
export interface RuntimeState {
  phase: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed'
  customerId?: string; host?: string; port?: number; error?: string
}
export interface SimulatorSnapshot {
  revision: number; config: SimulatorConfig; runtime: RuntimeState; logs: LogEntry[]; warning?: string
}
// 配置/运行变化发送整份快照，请求日志发送增量；两者使用同一 revision 排序。
export type SimulatorEvent =
  | { type: 'snapshot'; snapshot: SimulatorSnapshot }
  | { type: 'log'; revision: number; entry: LogEntry }
