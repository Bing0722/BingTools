/**
 * 配置迁移纯数据逻辑：生成导出文件结构、合并独立副本，并在保存前检查整批冲突。
 */
import { randomUUID } from 'node:crypto'
import { transferSchema, type TransferData, type TransferExport, type TransferPreview } from '../../shared/schemas/transfer'
import { customerNameKey, simulatorConfigSchema, type SimulatorConfig } from '../../shared/schemas/simulator'
import { motionConfigSchema, type MotionConfig, type MotionRule } from '../../shared/schemas/motion'

// 生成唯一名称时先给编号预留字符，避免追加后超出客户名长度限制。
function newName(name: string, names: Set<string>): string {
  let result = name
  for (let index = 2; names.has(customerNameKey(result)); index++) {
    const suffix = ` (${index})`
    result = name.slice(0, 100 - suffix.length) + suffix
  }
  names.add(customerNameKey(result)); return result
}
// 文本和 HEX 先统一转字节再判重；显示写法不同也可能对应完全相同的接收内容。
function validateMotionRules(rules: MotionRule[]) {
  const keys = rules.map((r) => Buffer.from(r.format === 'hex' ? r.receive.replace(/\s/g, '') : r.receive, r.format === 'hex' ? 'hex' : 'utf8').toString('hex'))
  if (new Set(keys).size !== keys.length) throw new Error('TRANSFER_CONFLICT')
}
export function mergeSimulatorTransfer(current: SimulatorConfig, input: TransferData, customerId?: string): SimulatorConfig {
  const data = transferSchema.parse(input)
  if (data.module !== 'simulator') throw new Error('TRANSFER_MODULE')
  const config = structuredClone(current)
  if (data.scope === 'customers') {
    const names = new Set(config.customers.map((c) => customerNameKey(c.name)))
    const customers = data.customers.map((c) => ({ ...c, id: randomUUID(), name: newName(c.name, names), endpoints: c.endpoints.map((e) => ({ ...e, id: randomUUID() })) }))
    config.customers.push(...customers); config.selectedCustomerId = customers[0].id
  } else {
    const customer = config.customers.find((c) => c.id === customerId)
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND')
    if (customer.protocol !== data.protocol) throw new Error('TRANSFER_PROTOCOL')
    const entries = [...customer.endpoints, ...data.endpoints.map((e) => ({ ...e, id: randomUUID() }))]
    const keys = entries.map((e) => customer.protocol === 'http' ? `${e.method} ${e.path}` : e.name)
    if (new Set(keys).size !== keys.length) throw new Error('TRANSFER_CONFLICT')
    customer.endpoints = entries
  }
  if (!simulatorConfigSchema.safeParse(config).success) throw new Error('TRANSFER_LIMIT')
  return config
}
export function mergeMotionTransfer(current: MotionConfig, input: TransferData, customerId?: string): MotionConfig {
  const data = transferSchema.parse(input)
  if (data.module !== 'motion') throw new Error('TRANSFER_MODULE')
  const config = structuredClone(current)
  if (data.scope === 'customers') {
    const names = new Set(config.customers.map((c) => customerNameKey(c.name)))
    const customers = data.customers.map((c) => {
      validateMotionRules(c.rules)
      return { ...c, id: randomUUID(), name: newName(c.name, names), rules: c.rules.map((r) => ({ ...r, id: randomUUID() })) }
    })
    config.customers.push(...customers); config.selectedCustomerId = customers[0].id
  } else {
    const customer = config.customers.find((c) => c.id === customerId)
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND')
    customer.rules.push(...data.rules.map((r) => ({ ...r, id: randomUUID() })))
    validateMotionRules(customer.rules)
  }
  if (!motionConfigSchema.safeParse(config).success) throw new Error('TRANSFER_LIMIT')
  return config
}
// 从已保存配置挑选导出范围，不读取页面草稿，也不携带日志或连接状态。
export function createTransfer(request: TransferExport, simulator: SimulatorConfig, motion: MotionConfig): TransferData {
  const base = { format: 'BingTools-transfer' as const, version: 1 as const }
  if (request.module === 'simulator') {
    const customers = request.customerId ? simulator.customers.filter((c) => c.id === request.customerId) : simulator.customers
    if (!customers.length) throw new Error('TRANSFER_EMPTY')
    if (request.scope === 'customers') return { ...base, module: 'simulator', scope: 'customers', customers }
    const customer = customers[0]
    const endpoints = request.interfaceId ? customer.endpoints.filter((e) => e.id === request.interfaceId) : customer.endpoints
    if (!endpoints.length) throw new Error('TRANSFER_EMPTY')
    return { ...base, module: 'simulator', scope: 'interfaces', protocol: customer.protocol, endpoints }
  }
  const customers = request.customerId ? motion.customers.filter((c) => c.id === request.customerId) : motion.customers
  if (!customers.length) throw new Error('TRANSFER_EMPTY')
  if (request.scope === 'customers') return { ...base, module: 'motion', scope: 'customers', customers }
  const rules = request.interfaceId ? customers[0].rules.filter((r) => r.id === request.interfaceId) : customers[0].rules
  if (!rules.length) throw new Error('TRANSFER_EMPTY')
  return { ...base, module: 'motion', scope: 'interfaces', rules }
}
// 页面只需数量与前十项名称；完整配置保存在主进程，通过随机 token 确认使用。
export function transferPreview(data: TransferData, token: string): TransferPreview {
  const entries = data.scope === 'customers' ? data.customers : data.module === 'simulator' ? data.endpoints : data.rules
  return { token, module: data.module, scope: data.scope, customers: data.scope === 'customers' ? entries.length : 0,
    interfaces: data.scope === 'interfaces' ? entries.length : data.module === 'simulator' ? data.customers.reduce((n, c) => n + c.endpoints.length, 0) : data.customers.reduce((n, c) => n + c.rules.length, 0),
    names: entries.slice(0, 10).map((e) => e.name), protocol: data.module === 'simulator' && data.scope === 'interfaces' ? data.protocol : undefined }
}
