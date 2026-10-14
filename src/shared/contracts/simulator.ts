import type { SimulatorConfig } from '../schemas/simulator'
export type LogLevel = 'info' | 'warn' | 'error'
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
export type SimulatorEvent =
  | { type: 'snapshot'; snapshot: SimulatorSnapshot }
  | { type: 'log'; revision: number; entry: LogEntry }
