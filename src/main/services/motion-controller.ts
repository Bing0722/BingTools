import { randomUUID } from 'node:crypto'
import { SerialPort } from 'serialport'
import { JsonRepository } from '../storage/json-repository'
import { SerialFramer } from './serial-framer'
import { defaultMotionConfig, motionConfigSchema, parseMotionConfig, SERIAL_LOG_LIMIT, type MotionCommand, type MotionConfig, type MotionCustomer, type MotionEvent, type MotionLog, type MotionRule, type MotionSnapshot, type MotionState, type SerialSettings } from '../../shared/schemas/motion'

export class MotionRepository extends JsonRepository<MotionConfig> {
  constructor(path: string) { super(path, defaultMotionConfig, parseMotionConfig) }
}
export type MotionPort = Pick<SerialPort, 'on' | 'open' | 'close' | 'write' | 'drain' | 'isOpen' | 'destroy'>
export interface SerialDriver { list: typeof SerialPort.list; create: (settings: SerialSettings) => MotionPort }
const nativeDriver: SerialDriver = { list: () => SerialPort.list(), create: (s) => new SerialPort({ path: s.path, baudRate: s.baudRate, dataBits: s.dataBits, stopBits: s.stopBits, parity: s.parity, rtscts: s.rtscts, autoOpen: false }) }
export function payload(rule: MotionRule, field: 'receive' | 'response'): Buffer { return Buffer.from(rule.format === 'hex' ? rule[field].replace(/\s/g, '') : rule[field], rule.format === 'hex' ? 'hex' : 'utf8') }
function serialError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'EACCES' || code === 'EPERM' ? 'MOTION_PERMISSION' : code === 'EBUSY' ? 'MOTION_PORT_BUSY' : code === 'ENOENT' ? 'MOTION_PORT_MISSING' : 'MOTION_SERIAL_ERROR'
}
/** 先去掉一次指定后缀（若存在），再按字节忽略尾部校验字段，禁止过度截断。 */
export function normalizeReceive(frame: Buffer, suffix: Buffer, ignore: number): Buffer | null {
  let value = frame
  if (suffix.length && value.length >= suffix.length && value.subarray(-suffix.length).equals(suffix)) value = value.subarray(0, -suffix.length)
  if (ignore >= value.length) return null
  return ignore ? value.subarray(0, -ignore) : value
}
export class MotionController {
  private revision = 0
  private phase: MotionState['phase'] = 'stopped'
  private customerId: string | null = null
  private error?: string
  private activeCustomer?: MotionCustomer
  private matches: { suffix: Buffer; ignore: number; rules: Map<string, MotionRule> }[] = []
  private port?: MotionPort
  private framer?: SerialFramer
  private queue = Promise.resolve()
  private writes = Promise.resolve()
  private pendingWrites = 0
  private shuttingDown = false
  private listeners = new Set<(event: MotionEvent) => void>()
  private logs: MotionLog[] = []
  private pending: MotionLog[] = []
  private sequence = 0
  private batchTimer?: ReturnType<typeof setTimeout>
  constructor(private repository: MotionRepository, private driver: SerialDriver = nativeDriver) {}
  state(): MotionState { return { revision: this.revision, config: this.repository.get(), phase: this.phase, customerId: this.customerId, error: this.error, warning: this.repository.warning } }
  snapshot(): MotionSnapshot { return { ...this.state(), logs: structuredClone(this.logs) } }
  subscribe(listener: (event: MotionEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit(event: MotionEvent) { for (const listener of this.listeners) listener(event) }
  private changed() { this.revision++; this.emit({ type: 'state', state: this.state() }) }
  private log(direction: MotionLog['direction'], code: string, data: Buffer = Buffer.alloc(0), ruleName?: string, level: MotionLog['level'] = 'info') {
    // 只保存最多 2 KiB 的预览；批量推送与配置快照分离，避免每条日志复制全部配置。
    const sample = data.subarray(0, 2048)
    const entry: MotionLog = { id: ++this.sequence, time: Date.now(), customerId: this.customerId, direction, code, level, text: sample.toString('utf8'), hex: sample.toString('hex').toUpperCase(), bytes: data.length, truncated: data.length > sample.length, ruleName }
    this.logs.push(entry); if (this.logs.length > SERIAL_LOG_LIMIT) this.logs.shift()
    this.pending.push(entry); if (this.pending.length > SERIAL_LOG_LIMIT) this.pending.shift()
    this.batchTimer ??= setTimeout(() => this.flushLogs(), 100)
  }
  private flushLogs() { clearTimeout(this.batchTimer); this.batchTimer = undefined; if (this.pending.length) this.emit({ type: 'logs', entries: this.pending.splice(0) }) }
  async listPorts() { try { return (await this.driver.list()).map(({ path, manufacturer }) => ({ path, manufacturer })) } catch { throw new Error('MOTION_LIST_FAILED') } }
  resume() { this.shuttingDown = false }
  execute(command: MotionCommand): Promise<MotionState> {
    const action = this.queue.then(async () => {
      if (this.shuttingDown) throw new Error('STOP_FIRST')
      await this.apply(command)
      return this.state()
    })
    this.queue = action.then(() => undefined, () => undefined)
    return action
  }
  private async apply(command: MotionCommand) {
    if (command.type === 'stop') { await this.stop(); return }
    if (command.type === 'clearLogs') {
      this.logs = command.customerId ? this.logs.filter((v) => v.customerId !== command.customerId) : []
      this.pending = command.customerId ? this.pending.filter((v) => v.customerId !== command.customerId) : []
      this.emit({ type: 'clear', customerId: command.customerId, throughId: this.sequence }); return
    }
    const config = this.repository.get()
    if (command.type === 'saveCustomer') {
      if (this.port) throw new Error('STOP_FIRST')
      const input = command.customer
      if (config.customers.some((v) => v.id !== input.id && v.name.toLowerCase() === input.name.toLowerCase())) throw new Error('DUPLICATE_CUSTOMER_NAME')
      const existing = config.customers.find((v) => v.id === input.id)
      const source = config.customers.find((v) => v.id === command.sourceId)
      if (command.sourceId && (!source || existing)) throw new Error('INVALID_INPUT')
      const customer: MotionCustomer = { ...input, rules: existing?.rules ?? source?.rules.map((r) => ({ ...r, id: randomUUID() })) ?? [] }
      config.customers = existing ? config.customers.map((v) => v.id === input.id ? customer : v) : [...config.customers, customer]
      config.selectedCustomerId = input.id
    } else {
      const customer = config.customers.find((v) => v.id === command.customerId)
      if (!customer) throw new Error('INVALID_INPUT')
      if (command.type === 'start') { await this.start(customer); return }
      if (command.type === 'sendRule') {
        const rule = customer.rules.find((v) => v.id === command.ruleId)
        if (!rule || this.customerId !== customer.id || this.phase !== 'running') throw new Error('MOTION_NOT_CONNECTED')
        await this.send(rule, customer); return
      }
      if (command.type === 'deleteCustomer' || command.type === 'selectCustomer') {
        if (this.port) throw new Error('STOP_FIRST')
        if (command.type === 'deleteCustomer') { config.customers = config.customers.filter((v) => v.id !== customer.id); if (config.selectedCustomerId === customer.id) config.selectedCustomerId = config.customers[0]?.id ?? null }
        else config.selectedCustomerId = customer.id
      } else {
        if (this.port && this.customerId !== customer.id) throw new Error('STOP_FIRST')
        if (command.type === 'saveRule') {
          if (customer.rules.some((r) => r.id !== command.rule.id && payload(r, 'receive').equals(payload(command.rule, 'receive')))) throw new Error('MOTION_DUPLICATE_RULE')
          customer.rules = customer.rules.some((r) => r.id === command.rule.id) ? customer.rules.map((r) => r.id === command.rule.id ? command.rule : r) : [...customer.rules, command.rule]
        } else if (command.type === 'reorderRules') {
          if (command.ids.length !== customer.rules.length || new Set(command.ids).size !== customer.rules.length || command.ids.some((id) => !customer.rules.some((r) => r.id === id))) throw new Error('INVALID_INPUT')
          customer.rules = command.ids.map((id) => customer.rules.find((r) => r.id === id)!)
        } else {
          if (!customer.rules.some((r) => r.id === command.ruleId)) throw new Error('INVALID_INPUT')
          customer.rules = command.type === 'deleteRule' ? customer.rules.filter((r) => r.id !== command.ruleId) : customer.rules.map((r) => r.id === command.ruleId ? { ...r, enabled: command.enabled } : r)
        }
      }
    }
    try { await this.repository.update(motionConfigSchema.parse(config)) } catch { throw new Error('SAVE_FAILED') }
    if (this.activeCustomer) this.setActive(config.customers.find((v) => v.id === this.activeCustomer!.id))
    this.changed()
  }
  private setActive(customer?: MotionCustomer) {
    // 配置成功落盘后才重建索引；每帧不复制完整客户配置或重新编码全部规则。
    this.activeCustomer = customer
    const groups = new Map<string, { suffix: Buffer; ignore: number; rules: Map<string, MotionRule> }>()
    for (const rule of customer?.rules ?? []) {
      if (!rule.enabled) continue
      const key = `${rule.receiveSuffix.toUpperCase()}:${rule.ignoreTailBytes}`
      let group = groups.get(key)
      if (!group) { group = { suffix: Buffer.from(rule.receiveSuffix, 'hex'), ignore: rule.ignoreTailBytes, rules: new Map() }; groups.set(key, group) }
      group.rules.set(payload(rule, 'receive').toString('hex'), rule)
    }
    this.matches = [...groups.values()]
  }
  private async start(customer: MotionCustomer) {
    if (this.port) throw new Error('STOP_FIRST')
    // 只能打开系统枚举的串口；不允许利用自定义路径访问普通文件。
    if (!(await this.listPorts()).some((v) => v.path === customer.serial.path)) throw new Error('MOTION_PORT_MISSING')
    this.phase = 'starting'; this.customerId = customer.id; this.error = undefined; this.changed()
    let port: MotionPort
    try { port = this.driver.create(customer.serial) } catch (error) { this.fail(serialError(error)); throw new Error(serialError(error), { cause: error }) }
    this.port = port
    this.setActive(customer)
    this.framer = new SerialFramer(customer.serial, (frame) => {
      if (this.port !== port || this.phase !== 'running') return
      const current = this.activeCustomer
      // 按预处理参数分组匹配，保留原始帧用于日志；不修改发送内容。
      const candidates = this.matches.flatMap((group) => {
        const normalized = normalizeReceive(frame, group.suffix, group.ignore)
        const match = normalized && group.rules.get(normalized.toString('hex'))
        return match ? [match] : []
      })
      if (candidates.length > 1) { this.log('rx', 'MOTION_AMBIGUOUS', frame, undefined, 'error'); return }
      const rule = candidates[0]
      this.log('rx', rule ? 'MOTION_MATCHED' : 'MOTION_UNMATCHED', frame, rule?.name)
      if (current && rule) void this.send(rule, current).catch(() => {})
    }, () => this.log('event', 'MOTION_FRAME_TOO_LARGE', undefined, undefined, 'error'))
    port.on('data', (data: Buffer) => { if (this.port === port) this.framer?.feed(data) })
    port.on('error', (error: Error) => { if (this.port === port) { this.fail(serialError(error)); this.scheduleStop() } })
    port.on('close', () => { if (this.port === port && this.phase !== 'stopping') { this.port = undefined; this.framer?.dispose(); this.fail('MOTION_DISCONNECTED') } })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MOTION_SERIAL_ERROR')), 3000)
        port.open((error) => {
          clearTimeout(timer)
          if (this.port !== port) { if (port.isOpen) port.close(() => {}); return }
          if (error) reject(error); else resolve()
        })
      })
      this.phase = 'running'; this.changed(); this.log('event', 'MOTION_CONNECTED')
    } catch (error) { this.port = undefined; this.framer?.dispose(); port.destroy(); this.fail(serialError(error)); throw new Error(serialError(error), { cause: error }) }
  }
  private fail(code: string) { this.phase = 'failed'; this.error = code; this.log('event', code, undefined, undefined, 'error'); this.changed() }
  private send(rule: MotionRule, customer: MotionCustomer): Promise<void> {
    const port = this.port
    if (!port || this.phase !== 'running') return Promise.reject(new Error('MOTION_NOT_CONNECTED'))
    if (this.pendingWrites >= 100) { this.log('event', 'MOTION_QUEUE_FULL', undefined, undefined, 'error'); return Promise.reject(new Error('MOTION_QUEUE_FULL')) }
    const bytes = Buffer.concat([payload(rule, 'response'), rule.appendDelimiter ? Buffer.from(customer.serial.delimiter, 'hex') : Buffer.alloc(0)])
    this.pendingWrites++
    const operation = this.writes.then(async () => {
      if (this.port !== port || this.phase !== 'running') throw new Error('MOTION_NOT_CONNECTED')
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MOTION_WRITE_TIMEOUT')), 3000)
        port.write(bytes, (error) => {
          if (error) { clearTimeout(timer); reject(error); return }
          port.drain((drainError) => { clearTimeout(timer); if (drainError) reject(drainError); else resolve() })
        })
      })
      this.log('tx', 'MOTION_SENT', bytes, rule.name)
    }).catch((error: unknown) => {
      const code = error instanceof Error && error.message === 'MOTION_WRITE_TIMEOUT' ? error.message : 'MOTION_SEND_FAILED'
      if (this.port === port && this.phase === 'running') { this.fail(code); this.scheduleStop() }
      throw new Error(code)
    }).finally(() => { this.pendingWrites-- })
    this.writes = operation.catch(() => {})
    return operation
  }
  private scheduleStop() {
    // 异常清理也进入生命周期队列，避免旧连接关闭覆盖新连接状态。
    const cleanup = this.queue.then(() => this.stop(false))
    this.queue = cleanup.catch(() => {})
  }
  private async stop(clearError = true) {
    const port = this.port
    this.phase = 'stopping'; this.changed(); this.framer?.dispose()
    // 在关闭开始时切断后续排队发送；最多等待三秒释放设备。
    this.port = undefined
    this.setActive(undefined)
    if (port) await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { port.destroy(); resolve() }, 3000)
      if (!port.isOpen) { port.destroy(); clearTimeout(timer); resolve(); return }
      port.close(() => { clearTimeout(timer); resolve() })
    })
    this.phase = clearError ? 'stopped' : 'failed'
    if (clearError) this.error = undefined
    this.changed(); if (port) this.log('event', 'MOTION_STOPPED')
    this.flushLogs()
  }
  async shutdown() {
    this.shuttingDown = true
    // 正在执行的操作也可能追加异常清理，必须等队列稳定后再关闭窗口。
    let pending: Promise<void>
    do { pending = this.queue; await pending } while (pending !== this.queue)
    await this.stop(); await this.repository.flush(); this.flushLogs()
  }
}
