import { afterEach, expect, it, vi } from 'vitest'
import { connect, createServer, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TcpSimulator, extractTcpName } from '../src/main/services/tcp-simulator'
import { SimulatorController } from '../src/main/services/simulator-controller'
import { SimulatorRepository } from '../src/main/storage/simulator-repository'
import { BODY_LIMIT, defaultTcpSettings, customerInputSchema, parseSimulatorConfig, type Customer } from '../src/shared/schemas/simulator'
import type { LogEntry } from '../src/shared/contracts/simulator'
const cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); vi.restoreAllMocks() })
async function port() {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const value = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return value
}
async function fixture(tcp = defaultTcpSettings) {
  const customer: Customer = { id: randomUUID(), name: 'TCP', protocol: 'tcp', host: '127.0.0.1', port: await port(), tcp,
    endpoints: [{ id: randomUUID(), name: 'getStatus', method: 'GET', path: '/api/example', format: 'json', status: 200, body: '{"ok":true}', enabled: true }] }
  const logs: Omit<LogEntry, 'id' | 'time'>[] = []
  const service = new TcpSimulator({ state: () => {}, log: (entry) => logs.push(entry) })
  cleanup.push(() => service.stop())
  await service.start(customer)
  const socket = connect(customer.port, customer.host)
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
  cleanup.push(() => { socket.destroy() })
  return { customer, service, socket, logs }
}
async function reply(socket: Socket, chunks: string[], expected: string) {
  const result = new Promise<string>((resolve, reject) => {
    let text = ''
    const timer = setTimeout(() => { socket.off('data', data); reject(new Error('No reply')) }, 2000)
    function data(chunk: Buffer) { text += chunk.toString(); if (text.length >= expected.length) { clearTimeout(timer); socket.off('data', data); resolve(text) } }
    socket.on('data', data)
  })
  for (const chunk of chunks) { socket.write(chunk); await new Promise((resolve) => setTimeout(resolve, 5)) }
  expect(await result).toBe(expected)
}
it('frames fragmented and coalesced JSON, extracts nested fields and supports live updates', async () => {
  const { service, customer, socket, logs } = await fixture({ ...defaultTcpSettings, field: 'data.action', delimiter: '0D0A' })
  await reply(socket, ['{"data":{"act', 'ion":"getStatus"}}\r', '\n{"data":{"action":"getStatus"}}\r\n'], '{"ok":true}\r\n{"ok":true}\r\n')
  customer.endpoints[0].body = 'updated'; customer.endpoints[0].format = 'text'; service.setCustomer(customer)
  await reply(socket, ['{"data":{"action":"getStatus"}}\r\n'], 'updated\r\n')
  customer.endpoints[0].enabled = false; service.setCustomer(customer)
  socket.write('{"data":{"action":"getStatus"}}\r\ninvalid\r\n{}\r\n')
  await vi.waitFor(() => expect(logs.some((v) => v.code === 'TCP_FIELD_MISSING')).toBe(true))
  expect(logs.filter((v) => v.code === 'TCP_REQUEST')).toHaveLength(3)
  expect(logs.some((v) => v.code === 'NOT_FOUND')).toBe(true)
  expect(logs.some((v) => v.code === 'TCP_INVALID_MESSAGE')).toBe(true)
})
it('extracts custom text fields and closes oversize frames', async () => {
  const { socket, logs } = await fixture({ ...defaultTcpSettings, extraction: 'text', separator: '|', index: 1 })
  await reply(socket, ['device|getStatus|123\n'], '{"ok":true}\n')
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
  socket.write(Buffer.alloc(BODY_LIMIT + 32, 65))
  await closed
  expect(logs.some((v) => v.code === 'PAYLOAD_TOO_LARGE')).toBe(true)
})
it('isolates connections, bounds log previews, releases ports and reports bind conflicts', async () => {
  const { customer, service, socket, logs } = await fixture()
  const other = new TcpSimulator({ state: () => {}, log: () => {} })
  cleanup.push(() => other.stop())
  await expect(other.start(customer)).rejects.toThrow('PORT_IN_USE')
  const second = connect(customer.port, customer.host); cleanup.push(() => { second.destroy() })
  await new Promise<void>((resolve) => second.once('connect', resolve))
  socket.write('{"action":')
  await reply(second, [JSON.stringify({ action: 'getStatus', extra: 'x'.repeat(9000) }) + '\n'], '{"ok":true}\n')
  await reply(socket, ['"getStatus"}\n'], '{"ok":true}\n')
  expect(logs.some((v) => v.requestTruncated && Buffer.byteLength(v.requestPreview ?? '') <= 8192)).toBe(true)
  await service.stop()
  expect(service.getState().phase).toBe('stopped')
  await other.start(customer)
})
it('migrates v1 and persists TCP configuration, rejecting duplicate names and failed hot saves', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bingtools-tcp-')); cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const file = join(dir, 'simulator.json')
  const config = parseSimulatorConfig({ schemaVersion: 1, selectedCustomerId: null, customers: [] })
  expect(config.schemaVersion).toBe(2)
  await writeFile(file, JSON.stringify({ ...config, schemaVersion: 1 }))
  const repository = new SimulatorRepository(file); await repository.load()
  const controller = new SimulatorController(repository); cleanup.push(() => controller.shutdown())
  const { customer, socket, service } = await fixture()
  await service.stop(); socket.destroy()
  const { endpoints, ...input } = customer
  await controller.execute({ type: 'saveCustomer', customer: input })
  await controller.execute({ type: 'saveEndpoint', customerId: customer.id, endpoint: endpoints[0] })
  await expect(controller.execute({ type: 'saveEndpoint', customerId: customer.id, endpoint: { ...endpoints[0], id: randomUUID() } })).rejects.toThrow('TCP_DUPLICATE_NAME')
  const restored = new SimulatorRepository(file); await restored.load()
  expect(restored.get().customers[0].tcp).toEqual(defaultTcpSettings)
  await controller.execute({ type: 'start', customerId: customer.id })
  const client = connect(customer.port, customer.host); cleanup.push(() => { client.destroy() })
  await new Promise<void>((resolve) => client.once('connect', resolve))
  vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('disk'))
  await expect(controller.execute({ type: 'saveEndpoint', customerId: customer.id, endpoint: { ...endpoints[0], body: '"bad"' } })).rejects.toThrow('SAVE_FAILED')
  await reply(client, ['{"action":"getStatus"}\n'], '{"ok":true}\n')
  await expect(controller.execute({ type: 'saveCustomer', customer: input })).rejects.toThrow('STOP_FIRST')
})
it('validates extraction settings and reads only own scalar fields', () => {
  expect(extractTcpName('{"constructor":"x"}', { ...defaultTcpSettings, field: 'constructor' })).toBeUndefined()
  expect(extractTcpName('{"data":{"code":42}}', { ...defaultTcpSettings, field: 'data.code' })).toBe('42')
  expect(extractTcpName('{"action":{}}')).toBeUndefined()
  const base = { id: randomUUID(), name: 'TCP', host: '127.0.0.1', port: 8080, protocol: 'tcp' }
  for (const patch of [{ delimiter: '' }, { delimiter: 'GG' }, { field: '__proto__.x' }, { index: -1 }]) expect(customerInputSchema.safeParse({ ...base, tcp: { ...defaultTcpSettings, ...patch } }).success).toBe(false)
})

it('compacts JSON responses without changing large integers or string whitespace', async () => {
  const { socket, customer, service } = await fixture()
  customer.endpoints[0].body = '{\n  "value": 9007199254740993, "text": "two words"\n}'
  service.setCustomer(customer)
  await reply(socket, ['{"action":"getStatus"}\n'], '{"value":9007199254740993,"text":"two words"}\n')
})
