import { afterEach, expect, it, vi } from 'vitest'
import { SerialPortMock } from 'serialport'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MotionController, MotionRepository } from '../src/main/services/motion-controller'
import { SerialFramer } from '../src/main/services/serial-framer'
import { defaultSerial, motionCommandSchema, type MotionEvent, type MotionRule } from '../src/shared/schemas/motion'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0)) await cleanup() })
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'bingtools-motion-'))
  const path = join(directory, 'motion.json'), repository = new MotionRepository(path)
  await repository.load()
  const device = `/dev/mock-${randomUUID()}`
  SerialPortMock.binding.createPort(device, { record: true })
  let port: SerialPortMock
  const controller = new MotionController(repository, { list: () => SerialPortMock.list(), create: (s) => { port = new SerialPortMock({ path: s.path, baudRate: s.baudRate, autoOpen: false }); return port } })
  cleanups.push(async () => { await controller.shutdown(); await rm(directory, { recursive: true, force: true }) })
  const customer = { id: randomUUID(), name: 'Motion A', serial: { ...defaultSerial, path: device } }
  await controller.execute({ type: 'saveCustomer', customer })
  const rule: MotionRule = { id: randomUUID(), name: 'Position', format: 'text', receive: 'POS?', response: '100', enabled: true, appendDelimiter: true, receiveSuffix: '', ignoreTailBytes: 0 }
  await controller.execute({ type: 'saveRule', customerId: customer.id, rule })
  return { controller, repository, customer, rule, path, getPort: () => port! }
}
it('splits partial/coalesced messages, fixed length, idle and bounds', () => {
  const frames: string[] = [], overflow = vi.fn()
  const parser = new SerialFramer({ ...defaultSerial, delimiter: '0D0A' }, (v) => frames.push(v.toString()), overflow)
  parser.feed(Buffer.from('POS?\r')); parser.feed(Buffer.from('\nA\r\nB\r\n'))
  expect(frames).toEqual(['POS?', 'A', 'B']); parser.dispose()
  const fixed = new SerialFramer({ ...defaultSerial, framing: 'length', frameLength: 2 }, (v) => frames.push(v.toString()), overflow)
  fixed.feed(Buffer.from('12345')); expect(frames.slice(-2)).toEqual(['12','34']); fixed.dispose()
  vi.useFakeTimers()
  const idle = new SerialFramer({ ...defaultSerial, framing: 'idle' }, (v) => frames.push(v.toString()), overflow)
  idle.feed(Buffer.from('hi')); vi.advanceTimersByTime(49); expect(frames.at(-1)).toBe('34')
  vi.advanceTimersByTime(1); expect(frames.at(-1)).toBe('hi')
  idle.feed(Buffer.alloc(70000, 65)); expect(overflow).toHaveBeenCalled(); idle.dispose()
})
it('matches and replies, supports manual sends while disabled and hot changes', async () => {
  const { controller, customer, rule, getPort } = await fixture()
  await controller.execute({ type: 'start', customerId: customer.id })
  const binding = getPort().port!
  binding.emitData(Buffer.from('POS')); binding.emitData(Buffer.from('?\nunknown\n'))
  await vi.waitFor(() => expect(binding.recording.toString()).toBe('100\n'))
  await controller.execute({ type: 'toggleRule', customerId: customer.id, ruleId: rule.id, enabled: false })
  binding.emitData(Buffer.from('POS?\n'))
  await controller.execute({ type: 'sendRule', customerId: customer.id, ruleId: rule.id })
  expect(binding.recording.toString()).toBe('100\n100\n')
  await controller.execute({ type: 'saveRule', customerId: customer.id, rule: { ...rule, response: '200' } })
  binding.emitData(Buffer.from('POS?\n'))
  await vi.waitFor(() => expect(binding.recording.toString()).toBe('100\n100\n200\n'))
  await expect(controller.execute({ type: 'saveCustomer', customer })).rejects.toThrow('STOP_FIRST')
  await controller.execute({ type: 'stop' }); expect(getPort().isOpen).toBe(false)
  expect(controller.snapshot().phase).toBe('stopped')
})
it('validates payloads, duplicate bytes across formats, isolation, copies and atomic persistence', async () => {
  const { controller, customer, rule, repository, path } = await fixture()
  expect(motionCommandSchema.safeParse({ type: 'saveRule', customerId: customer.id, rule: { ...rule, format: 'hex', receive: 'A' } }).success).toBe(false)
  await expect(controller.execute({ type: 'saveRule', customerId: customer.id, rule: { ...rule, id: randomUUID(), format: 'hex', receive: '50 4f 53 3f', response: '41' } })).rejects.toThrow('MOTION_DUPLICATE_RULE')
  const copy = { ...customer, id: randomUUID(), name: 'Copy' }
  await controller.execute({ type: 'saveCustomer', customer: copy, sourceId: customer.id })
  const copied = controller.snapshot().config.customers[1].rules[0]
  expect(copied.id).not.toBe(rule.id); expect(copied.receive).toBe(rule.receive)
  await expect(controller.execute({ type: 'saveCustomer', customer: { ...copy, name: 'motion a' } })).rejects.toThrow('DUPLICATE_CUSTOMER_NAME')
  vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('disk'))
  await expect(controller.execute({ type: 'toggleRule', customerId: customer.id, ruleId: rule.id, enabled: false })).rejects.toThrow('SAVE_FAILED')
  expect(controller.snapshot().config.customers[0].rules[0].enabled).toBe(true)
  const loaded = await new MotionRepository(path).load()
  expect(loaded.customers).toHaveLength(2)
  expect(new MotionController(new MotionRepository(path)).snapshot().phase).toBe('stopped')
  await expect(controller.execute({ type: 'start', customerId: randomUUID() })).rejects.toThrow('INVALID_INPUT')
})
it('batches logs, caps previews/history and cleans subscriptions and timers', async () => {
  const { controller, customer, getPort } = await fixture()
  const events: MotionEvent[] = [], off = controller.subscribe((event) => events.push(event))
  await controller.execute({ type: 'start', customerId: customer.id })
  getPort().port!.emitData(Buffer.from('x'.repeat(3000) + '\n' + 'unknown\n'.repeat(2500)))
  await vi.waitFor(() => expect(controller.snapshot().logs).toHaveLength(2000))
  await vi.waitFor(() => expect(events.some((v) => v.type === 'logs')).toBe(true))
  expect(events.filter((v) => v.type === 'logs').length).toBeLessThan(20)
  getPort().port!.emitData(Buffer.from('x'.repeat(3000) + '\n'))
  await vi.waitFor(() => expect(controller.snapshot().logs.at(-1)?.truncated).toBe(true))
  expect(controller.snapshot().logs.at(-1)?.text.length).toBe(2048)
  await controller.execute({ type: 'clearLogs', customerId: customer.id })
  expect(controller.snapshot().logs).toEqual([])
  off(); const before = events.length
  await controller.shutdown(); expect(events).toHaveLength(before)
})
it('reports unavailable ports and disconnects, and permits clean restart', async () => {
  const { controller, customer, getPort } = await fixture()
  await controller.execute({ type: 'saveCustomer', customer: { ...customer, serial: { ...customer.serial, path: '/not-a-port' } } })
  await expect(controller.execute({ type: 'start', customerId: customer.id })).rejects.toThrow('MOTION_PORT_MISSING')
  await controller.execute({ type: 'saveCustomer', customer })
  await controller.execute({ type: 'start', customerId: customer.id })
  await new Promise<void>((resolve) => getPort().close(() => resolve()))
  expect(controller.snapshot().error).toBe('MOTION_DISCONNECTED')
  await controller.execute({ type: 'start', customerId: customer.id })
  expect(controller.snapshot().phase).toBe('running')
})
it('discards an oversized frame until the next boundary without matching its tail', () => {
  const frames: string[] = [], overflow = vi.fn()
  const parser = new SerialFramer({ ...defaultSerial }, (v) => frames.push(v.toString()), overflow)
  parser.feed(Buffer.alloc(70000, 65)); parser.feed(Buffer.from('POS?\nNEXT\n'))
  expect(frames).toEqual(['NEXT']); expect(overflow).toHaveBeenCalledTimes(1); parser.dispose()
})
it('handles messages every 200 ms without losing replies', async () => {
  const { controller, customer, getPort } = await fixture()
  const events: MotionEvent[] = [], unsubscribe = controller.subscribe((v) => events.push(v))
  await controller.execute({ type: 'start', customerId: customer.id })
  for (let index = 0; index < 10; index++) {
    getPort().port!.emitData(Buffer.from('POS?\n'))
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  expect(getPort().port!.recording.toString()).toBe('100\n'.repeat(10))
  expect(controller.snapshot().logs.filter((v) => v.direction === 'rx')).toHaveLength(10)
  expect(controller.snapshot().logs.filter((v) => v.direction === 'tx')).toHaveLength(10)
  expect(events.filter((v) => v.type === 'logs').length).toBeLessThanOrEqual(11)
  unsubscribe()
})
it('strips CR and checksum bytes only for matching, keeps original logs and hot updates', async () => {
  const { controller, customer, rule, getPort } = await fixture()
  await controller.execute({ type: 'saveRule', customerId: customer.id, rule: { ...rule, receiveSuffix: '0D', ignoreTailBytes: 1 } })
  await controller.execute({ type: 'start', customerId: customer.id })
  const binding = getPort().port!
  binding.emitData(Buffer.from('POS?X\r\n'))
  await vi.waitFor(() => expect(binding.recording.toString()).toBe('100\n'))
  expect(controller.snapshot().logs.find((v) => v.direction === 'rx')?.hex).toBe('504F533F580D')
  await controller.execute({ type: 'saveRule', customerId: customer.id, rule: { ...rule, receiveSuffix: '0D', ignoreTailBytes: 0 } })
  binding.emitData(Buffer.from('POS?\r\nPOS?\n'))
  await vi.waitFor(() => expect(binding.recording.toString()).toBe('100\n'.repeat(3)))
  binding.emitData(Buffer.from('POS?X\r\n'))
  await vi.waitFor(() => expect(controller.snapshot().logs.at(-1)?.code).toBe('MOTION_UNMATCHED'))
})
it('preserves legacy rules and validates tail options', async () => {
  const { parseMotionConfig } = await import('../src/shared/schemas/motion')
  const { normalizeReceive } = await import('../src/main/services/motion-controller')
  const { controller, customer, rule } = await fixture()
  const old = { ...controller.snapshot().config, schemaVersion: 1, customers: [{ ...customer, rules: [{ id: rule.id, name: rule.name, enabled: true, format: 'text', receive: 'POS?', response: 'OK', appendDelimiter: true }] }] }
  const migrated = parseMotionConfig(old)
  expect(migrated.schemaVersion).toBe(2)
  expect(migrated.customers[0].rules[0]).toMatchObject({ receiveSuffix: '', ignoreTailBytes: 0, receive: 'POS?' })
  for (const change of [{ receiveSuffix: 'D' }, { ignoreTailBytes: -1 }, { ignoreTailBytes: 257 }, { ignoreTailBytes: 1.5 }]) expect(motionCommandSchema.safeParse({ type: 'saveRule', customerId: customer.id, rule: { ...rule, ...change } }).success).toBe(false)
  expect(normalizeReceive(Buffer.from('A\r'), Buffer.from('0D', 'hex'), 1)).toBeNull()
  expect(normalizeReceive(Buffer.from('A\r\r'), Buffer.from('0D', 'hex'), 0)?.toString()).toBe('A\r')
  expect(normalizeReceive(Buffer.from('A '), Buffer.from('0D', 'hex'), 0)?.toString()).toBe('A ')
})
it('does not reply when different preprocessing rules produce ambiguous matches', async () => {
  const { controller, customer, rule, getPort } = await fixture()
  await controller.execute({ type: 'saveRule', customerId: customer.id, rule: { ...rule, id: randomUUID(), name: 'Short', receive: 'POS', ignoreTailBytes: 1 } })
  await controller.execute({ type: 'start', customerId: customer.id })
  getPort().port!.emitData(Buffer.from('POS?\n'))
  await vi.waitFor(() => expect(controller.snapshot().logs.at(-1)?.code).toBe('MOTION_AMBIGUOUS'))
  expect(getPort().port!.recording.length).toBe(0)
})
