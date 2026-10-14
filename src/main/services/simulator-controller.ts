import type { SimulatorRepository } from '../storage/simulator-repository'
import { simulatorCommandSchema, simulatorConfigSchema, type SimulatorCommand } from '../../shared/schemas/simulator'
import type { SimulatorEvent, SimulatorSnapshot } from '../../shared/contracts/simulator'
import { HttpSimulator } from './http-simulator'
import { LogBuffer } from './log-buffer'

/** 配置修改、启停和退出共享队列，避免端口与客户配置互相竞争。 */
export class SimulatorController {
  private queue: Promise<void> = Promise.resolve()
  private listeners = new Set<(event: SimulatorEvent) => void>()
  private logs = new LogBuffer()
  private revision = 0
  private closing = false
  readonly service: HttpSimulator
  constructor(private readonly repository: SimulatorRepository) {
    this.service = new HttpSimulator({
      state: () => this.publish(),
      log: (record) => {
        const entry = this.logs.add(record)
        this.emit({ type: 'log', revision: ++this.revision, entry })
      },
    })
  }
  snapshot(): SimulatorSnapshot {
    return { revision: this.revision, config: this.repository.get(), runtime: this.service.getState(), logs: this.logs.get(), warning: this.repository.warning }
  }
  subscribe(listener: (event: SimulatorEvent) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit(event: SimulatorEvent) { for (const listener of this.listeners) listener(event) }
  private publish() { this.revision++; this.emit({ type: 'snapshot', snapshot: this.snapshot() }) }
  resume(): void { this.closing = false }
  async shutdown(): Promise<void> {
    this.closing = true
    await this.queue
    await this.service.stop()
    await this.repository.flush()
  }
  execute(command: SimulatorCommand): Promise<SimulatorSnapshot> {
    const operation = this.queue.then(async () => {
      if (this.closing) throw new Error('CLOSING')
      const parsed = simulatorCommandSchema.safeParse(command)
      if (!parsed.success) throw new Error('INVALID_INPUT')
      await this.apply(parsed.data)
      return this.snapshot()
    })
    this.queue = operation.then(() => undefined, () => undefined)
    return operation
  }
  private async apply(command: SimulatorCommand): Promise<void> {
    if (command.type === 'stop') { await this.service.stop(); return }
    if (command.type === 'clearLogs') { this.logs.clear(command.customerId); this.publish(); return }
    const config = this.repository.get()
    const runtime = this.service.getState()
    const busy = ['starting', 'running', 'stopping'].includes(runtime.phase)
    if (command.type === 'saveCustomer') {
      if (busy) throw new Error('STOP_FIRST')
      const index = config.customers.findIndex((entry) => entry.id === command.customer.id)
      if (index < 0) config.customers.push({ ...command.customer, endpoints: [] })
      else config.customers[index] = { ...command.customer, endpoints: config.customers[index].endpoints }
      config.selectedCustomerId = command.customer.id
    } else {
      const customer = config.customers.find((entry) => entry.id === command.customerId)
      if (!customer) throw new Error('CUSTOMER_NOT_FOUND')
      if (command.type === 'start') {
        if (config.selectedCustomerId !== customer.id) throw new Error('INVALID_INPUT')
        await this.service.start(customer); return
      }
      if (command.type === 'selectCustomer' || command.type === 'deleteCustomer') {
        if (busy) throw new Error('STOP_FIRST')
        if (command.type === 'selectCustomer') config.selectedCustomerId = customer.id
        else {
          config.customers = config.customers.filter((entry) => entry.id !== customer.id)
          if (config.selectedCustomerId === customer.id) config.selectedCustomerId = config.customers[0]?.id ?? null
        }
      } else {
        if (busy && runtime.customerId !== customer.id) throw new Error('STOP_FIRST')
        if (command.type === 'saveEndpoint') {
          if (customer.endpoints.some((entry) => entry.id !== command.endpoint.id && entry.method === command.endpoint.method && entry.path === command.endpoint.path)) throw new Error('DUPLICATE_ROUTE')
          const index = customer.endpoints.findIndex((entry) => entry.id === command.endpoint.id)
          if (index < 0) customer.endpoints.push(command.endpoint)
          else customer.endpoints[index] = command.endpoint
        } else {
          const endpoint = customer.endpoints.find((entry) => entry.id === command.endpointId)
          if (!endpoint) throw new Error('ENDPOINT_NOT_FOUND')
          if (command.type === 'deleteEndpoint') customer.endpoints = customer.endpoints.filter((entry) => entry.id !== endpoint.id)
          else endpoint.enabled = command.enabled
        }
      }
    }
    if (!simulatorConfigSchema.safeParse(config).success) throw new Error('INVALID_INPUT')
    try { await this.repository.update(config) }
    catch { throw new Error('SAVE_FAILED') }
    // 只有成功持久化的配置才能成为运行时快照。
    const active = config.customers.find((entry) => entry.id === runtime.customerId)
    if (active && busy) this.service.setCustomer(active)
    this.publish()
  }
}
