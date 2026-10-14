import type { Preferences, SettingsPatch } from '../schemas/settings'
import type { CustomerInput, Endpoint } from '../schemas/simulator'
import type { SimulatorEvent, SimulatorSnapshot } from './simulator'
export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
export interface SettingsSnapshot { preferences: Preferences; warning?: string; systemLocale?: string }
export interface AppApi {
  platform: 'darwin' | 'win32' | 'linux'
  settings: {
    get(): Promise<Result<SettingsSnapshot>>
    update(patch: SettingsPatch): Promise<Result<SettingsSnapshot>>
  }
  simulator: {
    getSnapshot(): Promise<Result<SimulatorSnapshot>>
    saveCustomer(customer: CustomerInput): Promise<Result<SimulatorSnapshot>>
    deleteCustomer(customerId: string): Promise<Result<SimulatorSnapshot>>
    selectCustomer(customerId: string): Promise<Result<SimulatorSnapshot>>
    saveEndpoint(customerId: string, endpoint: Endpoint): Promise<Result<SimulatorSnapshot>>
    deleteEndpoint(customerId: string, endpointId: string): Promise<Result<SimulatorSnapshot>>
    setEndpointEnabled(customerId: string, endpointId: string, enabled: boolean): Promise<Result<SimulatorSnapshot>>
    start(customerId: string): Promise<Result<SimulatorSnapshot>>
    stop(): Promise<Result<SimulatorSnapshot>>
    clearLogs(customerId: string | null): Promise<Result<SimulatorSnapshot>>
    onEvent(listener: (event: SimulatorEvent) => void): () => void
  }
}
