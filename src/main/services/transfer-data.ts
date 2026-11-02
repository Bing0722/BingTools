import { randomUUID } from 'node:crypto'
import { transferSchema, type TransferData, type TransferExport, type TransferPreview } from '../../shared/schemas/transfer'
import { customerNameKey, simulatorConfigSchema, type SimulatorConfig } from '../../shared/schemas/simulator'
import { motionConfigSchema, type MotionConfig, type MotionRule } from '../../shared/schemas/motion'

function newName(name: string, names: Set<string>): string {
  let result = name
  for (let index = 2; names.has(customerNameKey(result)); index++) {
    const suffix = ` (${index})`
    result = name.slice(0, 100 - suffix.length) + suffix
  }
  names.add(customerNameKey(result)); return result
}
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
export function transferPreview(data: TransferData, token: string): TransferPreview {
  const entries = data.scope === 'customers' ? data.customers : data.module === 'simulator' ? data.endpoints : data.rules
  return { token, module: data.module, scope: data.scope, customers: data.scope === 'customers' ? entries.length : 0,
    interfaces: data.scope === 'interfaces' ? entries.length : data.module === 'simulator' ? data.customers.reduce((n, c) => n + c.endpoints.length, 0) : data.customers.reduce((n, c) => n + c.rules.length, 0),
    names: entries.slice(0, 10).map((e) => e.name), protocol: data.module === 'simulator' && data.scope === 'interfaces' ? data.protocol : undefined }
}
