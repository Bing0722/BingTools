import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { createTransfer, mergeMotionTransfer, mergeSimulatorTransfer, transferPreview } from '../src/main/services/transfer-data'
import { defaultSimulatorConfig, defaultTcpSettings, type Customer, type Endpoint } from '../src/shared/schemas/simulator'
import { defaultMotionConfig, defaultSerial, type MotionCustomer, type MotionRule } from '../src/shared/schemas/motion'
import { transferApplySchema, transferExportSchema, transferSchema, type TransferData } from '../src/shared/schemas/transfer'
import { SimulatorRepository } from '../src/main/storage/simulator-repository'
import { SimulatorController } from '../src/main/services/simulator-controller'
import { MotionController, MotionRepository } from '../src/main/services/motion-controller'

const header = { format: 'BingTools-transfer', version: 1 } as const
const endpoint: Endpoint = { id: randomUUID(), name: 'getStatus', method: 'GET', path: '/status', status: 201, enabled: true, format: 'json', body: '{"ok":true}', responseDelay: { enabled: true, ms: 1000 } }
const customer: Customer = { id: randomUUID(), name: 'Demo', host: '127.0.0.1', port: 8080, protocol: 'http', endpoints: [endpoint] }
const rule: MotionRule = { id: randomUUID(), name: 'Position', format: 'hex', receive: '50 4F 53', response: '41', enabled: true, appendDelimiter: true, receiveSuffix: '0D', ignoreTailBytes: 1 }
const motion: MotionCustomer = { id: randomUUID(), name: 'Demo', serial: { ...defaultSerial, path: '/dev/old-machine' }, rules: [rule] }
const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); vi.restoreAllMocks() })

it('round-trips HTTP, TCP and serial customer fields with new IDs, stable order and unique names', () => {
  const tcp: Customer = { ...customer, id: randomUUID(), name: 'demo', protocol: 'tcp', tcp: { ...defaultTcpSettings, lengthHeader: { width: 5, radix: 'decimal', unit: 'bytes', scope: 'body', wrapResponse: true, prefix: '<HH', suffix: '>' } } }
  const source = { ...defaultSimulatorConfig, customers: [customer, tcp] }
  const data = createTransfer({ module: 'simulator', scope: 'customers' }, source, defaultMotionConfig)
  const output = mergeSimulatorTransfer(source, transferSchema.parse(JSON.parse(JSON.stringify(data))))
  expect(output.customers.map((c) => c.name)).toEqual(['Demo', 'demo', 'Demo (2)', 'demo (3)'])
  expect(output.customers[2].id).not.toBe(customer.id)
  expect(output.customers[2].endpoints[0]).toEqual({ ...endpoint, id: expect.any(String) })
  expect(output.customers[2].endpoints[0].id).not.toBe(endpoint.id)
  expect(output.customers[3].tcp).toEqual(tcp.tcp)
  expect(output.selectedCustomerId).toBe(output.customers[2].id)
  const serialSource = { ...defaultMotionConfig, customers: [motion] }
  const serialData = createTransfer({ module: 'motion', scope: 'customers' }, defaultSimulatorConfig, serialSource)
  const serialOutput = mergeMotionTransfer(serialSource, serialData)
  expect(serialOutput.customers[1]).toEqual({ ...motion, name: 'Demo (2)', id: expect.any(String), rules: [{ ...rule, id: expect.any(String) }] })
  expect(serialOutput.customers[1].rules[0].id).not.toBe(rule.id)
  expect(transferPreview(serialData, randomUUID())).toMatchObject({ customers: 1, interfaces: 1, names: ['Demo'] })
})
it('exports selected interfaces and appends atomically, rejecting protocol/module/route conflicts', () => {
  const source = { ...defaultSimulatorConfig, customers: [customer] }
  const data = createTransfer({ module: 'simulator', scope: 'interfaces', customerId: customer.id, interfaceId: endpoint.id }, source, defaultMotionConfig)
  expect(data).toMatchObject({ scope: 'interfaces', protocol: 'http', endpoints: [endpoint] })
  expect(() => mergeSimulatorTransfer(source, data, customer.id)).toThrow('TRANSFER_CONFLICT')
  const empty = { ...source, customers: [{ ...customer, endpoints: [] }] }
  expect(mergeSimulatorTransfer(empty, data, customer.id).customers[0].endpoints[0].body).toBe(endpoint.body)
  expect(empty.customers[0].endpoints).toEqual([])
  expect(() => mergeSimulatorTransfer({ ...empty, customers: [{ ...customer, protocol: 'tcp', endpoints: [] }] }, data, customer.id)).toThrow('TRANSFER_PROTOCOL')
  expect(() => mergeMotionTransfer(defaultMotionConfig, data)).toThrow('TRANSFER_MODULE')
  expect(() => mergeSimulatorTransfer(empty, data, randomUUID())).toThrow('CUSTOMER_NOT_FOUND')
  const invalid: TransferData = { ...header, module: 'simulator', scope: 'interfaces', protocol: 'http', endpoints: [endpoint, { ...endpoint, id: randomUUID() }] }
  expect(() => mergeSimulatorTransfer(empty, invalid, customer.id)).toThrow('TRANSFER_CONFLICT')
})
it('rejects serial duplicate receive bytes across encodings and keeps destination unchanged', () => {
  const current = { ...defaultMotionConfig, customers: [motion] }
  const data: TransferData = { ...header, module: 'motion', scope: 'interfaces', rules: [{ ...rule, id: randomUUID(), format: 'text', receive: 'POS', response: 'A' }] }
  expect(() => mergeMotionTransfer(current, data, motion.id)).toThrow('TRANSFER_CONFLICT')
  expect(current.customers[0].rules).toEqual([rule])
  const empty = { ...current, customers: [{ ...motion, rules: [] }] }
  expect(mergeMotionTransfer(empty, data, motion.id).customers[0].rules).toHaveLength(1)
})
it('validates strict IPC/file contracts, limits, versions and malformed content', () => {
  expect(transferExportSchema.safeParse({ module: 'motion', scope: 'interfaces' }).success).toBe(false)
  expect(transferExportSchema.safeParse({ module: 'motion', scope: 'customers', path: '/tmp/file' }).success).toBe(false)
  expect(transferApplySchema.safeParse({ token: '../../file' }).success).toBe(false)
  for (const patch of [{ version: 2 }, { format: 'unknown' }, { customers: [] }, { customers: [{ ...customer, endpoints: [{ ...endpoint, body: 'invalid' }] }] }, { logs: [] }]) {
    expect(transferSchema.safeParse({ ...header, module: 'simulator', scope: 'customers', customers: [customer], ...patch }).success).toBe(false)
  }
  const data: TransferData = { ...header, module: 'simulator', scope: 'customers', customers: [customer] }
  expect(() => mergeSimulatorTransfer({ ...defaultSimulatorConfig, customers: Array.from({ length: 100 }, (_, i) => ({ ...customer, id: randomUUID(), name: String(i) })) }, data)).toThrow('TRANSFER_LIMIT')
  expect(() => createTransfer({ module: 'motion', scope: 'customers' }, defaultSimulatorConfig, defaultMotionConfig)).toThrow('TRANSFER_EMPTY')
})
it('imports through controller queues, survives restart and leaves all data intact on save failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bingtools-transfer-'))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const repo = new SimulatorRepository(join(dir, 'simulator.json')); await repo.load()
  const simulator = new SimulatorController(repo); cleanup.push(() => simulator.shutdown())
  const motionRepo = new MotionRepository(join(dir, 'motion.json')); await motionRepo.load()
  const serial = new MotionController(motionRepo); cleanup.push(() => serial.shutdown())
  const data: TransferData = { ...header, module: 'simulator', scope: 'customers', customers: [customer] }
  vi.spyOn(repo, 'update').mockRejectedValueOnce(new Error('disk full'))
  await expect(simulator.importData(data)).rejects.toThrow('SAVE_FAILED')
  expect(simulator.snapshot().config.customers).toEqual([])
  await Promise.all([simulator.importData(data), simulator.importData(data)])
  expect(simulator.snapshot().config.customers.map((c) => c.name)).toEqual(['Demo', 'Demo (2)'])
  expect((await new SimulatorRepository(join(dir, 'simulator.json')).load()).customers).toEqual(simulator.snapshot().config.customers)
  const serialData: TransferData = { ...header, module: 'motion', scope: 'customers', customers: [motion] }
  vi.spyOn(motionRepo, 'update').mockRejectedValueOnce(new Error('disk full'))
  await expect(serial.importData(serialData)).rejects.toThrow('SAVE_FAILED')
  expect(serial.state().config.customers).toEqual([])
  await serial.importData(serialData)
  expect((await new MotionRepository(join(dir, 'motion.json')).load()).customers).toEqual(serial.state().config.customers)
  expect(serial.state().phase).toBe('stopped')
  // 真实监听运行时拒绝导入；排队的停止完成后才能导入。
  const reserve = createServer(); await new Promise<void>((resolve) => reserve.listen(0, '127.0.0.1', resolve))
  const address = reserve.address(); if (!address || typeof address === 'string') throw new Error('address')
  await new Promise<void>((resolve) => reserve.close(() => resolve()))
  const { endpoints: _endpoints, ...input } = simulator.snapshot().config.customers[0]
  void _endpoints
  await simulator.execute({ type: 'saveCustomer', customer: { ...input, port: address.port } })
  await simulator.execute({ type: 'start', customerId: input.id })
  await expect(simulator.importData(data)).rejects.toThrow('STOP_FIRST')
  await simulator.execute({ type: 'stop' })
  await simulator.importData(data)
  expect(simulator.snapshot().config.customers).toHaveLength(3)
})
