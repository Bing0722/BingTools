import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpSimulator } from '../src/main/services/http-simulator'
import { SimulatorController } from '../src/main/services/simulator-controller'
import { SimulatorRepository } from '../src/main/storage/simulator-repository'
import { LogBuffer, preview, redactHeaders } from '../src/main/services/log-buffer'
import { BODY_LIMIT, customerInputSchema, endpointSchema, simulatorCommandSchema, type Customer, type Endpoint } from '../src/shared/schemas/simulator'
import type { LogEntry } from '../src/shared/contracts/simulator'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); vi.restoreAllMocks() })
async function freePort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing address')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return address.port
}
function endpoint(patch: Partial<Endpoint> = {}): Endpoint {
  return { id: randomUUID(), name: 'Example', path: '/api/example', method: 'GET', format: 'json', status: 200, body: '{"ok":true}', enabled: true, ...patch }
}
async function customer(endpoints = [endpoint()]): Promise<Customer> {
  return { id: randomUUID(), name: '客户 A', host: '127.0.0.1', port: await freePort(), protocol: 'http', endpoints }
}
async function serviceFixture(endpoints?: Endpoint[]) {
  const logs: Omit<LogEntry, 'id' | 'time'>[] = []
  const service = new HttpSimulator({ state: () => {}, log: (entry) => logs.push(entry) })
  const config = await customer(endpoints)
  cleanup.push(() => service.stop())
  await service.start(config)
  return { service, config, logs, url: `http://127.0.0.1:${config.port}` }
}
async function repositoryFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'bingtools-simulator-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'simulator.json')
  const repository = new SimulatorRepository(path)
  await repository.load()
  const controller = new SimulatorController(repository)
  cleanup.push(() => controller.shutdown())
  return { directory, path, repository, controller }
}

describe('real HTTP simulator', () => {
  it('matches exact method and pathname, ignores queries and applies live changes', async () => {
    const { service, config, url, logs } = await serviceFixture()
    const first = await fetch(`${url}/api/example?ignored=1`)
    expect(first.headers.get('content-type')).toContain('application/json')
    expect(await first.json()).toEqual({ ok: true })
    for (const [path, method] of [['/api/example/', 'GET'], ['/api/example', 'POST'], ['/missing', 'GET']]) {
      expect((await fetch(url + path, { method })).status).toBe(404)
    }
    config.endpoints[0].enabled = false
    service.setCustomer(config)
    expect((await fetch(url + '/api/example')).status).toBe(404)
    config.endpoints[0] = { ...config.endpoints[0], enabled: true, format: 'text', body: '已更新', status: 201 }
    service.setCustomer(config)
    const updated = await fetch(url + '/api/example')
    expect(updated.status).toBe(201)
    expect(updated.headers.get('content-type')).toContain('text/plain')
    expect(await updated.text()).toBe('已更新')
    expect(logs.some((entry) => entry.method === 'GET' && entry.path === '/api/example' && entry.status === 201)).toBe(true)
    await service.stop()
    await expect(fetch(url)).rejects.toThrow()
    expect(service.getState().phase).toBe('stopped')
  })
  it('supports all methods and suppresses bodies for HEAD, 204 and 304', async () => {
    const entries = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => endpoint({ method: method as Endpoint['method'] }))
    entries.push(endpoint({ path: '/204', status: 204 }), endpoint({ path: '/304', status: 304 }))
    const { url } = await serviceFixture(entries)
    for (const entry of entries) {
      const response = await fetch(url + entry.path, { method: entry.method })
      expect(response.status).toBe(entry.status)
      expect(await response.text()).toBe(entry.method === 'HEAD' || entry.status !== 200 ? '' : entry.body)
    }
  })
  it('limits declared and chunked request bodies and redacts and truncates previews', async () => {
    const { url, logs } = await serviceFixture([endpoint({ method: 'POST', format: 'text', body: '中'.repeat(4000) })])
    await fetch(url + '/api/example', { method: 'POST', body: '文'.repeat(4000), headers: { Authorization: 'secret', Cookie: 'session=secret', 'X-Api-Key': 'secret' } })
    const log = logs.find((entry) => entry.method === 'POST')!
    expect(log.requestHeaders).toMatchObject({ authorization: '[REDACTED]', cookie: '[REDACTED]', 'x-api-key': '[REDACTED]' })
    expect(Buffer.byteLength(log.requestPreview!)).toBeLessThanOrEqual(8192)
    expect(Buffer.byteLength(log.responsePreview!)).toBeLessThanOrEqual(8192)
    expect(log.requestTruncated && log.responseTruncated).toBe(true)
    expect((await fetch(url, { method: 'POST', body: 'x'.repeat(BODY_LIMIT + 1) })).status).toBe(413)
    const status = await new Promise<number>((resolve, reject) => {
      const outgoing = request(url, { method: 'POST' }, (incoming) => { incoming.resume(); resolve(incoming.statusCode!) })
      outgoing.on('error', reject)
      outgoing.write('x'.repeat(BODY_LIMIT)); outgoing.end('x')
    })
    expect(status).toBe(413)
  })
  it('reports occupied and unavailable addresses and can recover after failure', async () => {
    const { config } = await serviceFixture()
    const service = new HttpSimulator({ state: () => {}, log: () => {} })
    cleanup.push(() => service.stop())
    await expect(service.start(config)).rejects.toThrow('PORT_IN_USE')
    expect(service.getState()).toMatchObject({ phase: 'failed', error: 'PORT_IN_USE' })
    await expect(service.start({ ...config, host: '192.0.2.123' })).rejects.toThrow('ADDRESS_UNAVAILABLE')
    await service.start({ ...config, port: await freePort() })
    expect(service.getState().phase).toBe('running')
  })
  it('bounds shutdown with an unfinished request and releases its port', async () => {
    const { service, config, url } = await serviceFixture()
    const socket = connect(config.port, config.host)
    socket.on('error', () => {})
    cleanup.push(async () => { socket.destroy() })
    await new Promise<void>((resolve) => socket.once('connect', resolve))
    socket.write('POST /api/example HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\nx')
    await new Promise((resolve) => setTimeout(resolve, 20))
    const started = Date.now()
    await service.stop()
    expect(Date.now() - started).toBeLessThan(3500)
    await expect(fetch(url)).rejects.toThrow()
  }, 6000)
})

describe('configuration and lifecycle', () => {
  it('isolates customers, restores configuration and rejects duplicates', async () => {
    const { controller, path } = await repositoryFixture()
    const a = await customer(); const b = { ...await customer([]), name: '客户 B' }
    const aInput = { id: a.id, name: a.name, host: a.host, port: a.port, protocol: a.protocol }
    const bInput = { id: b.id, name: b.name, host: b.host, port: b.port, protocol: b.protocol }
    await controller.execute({ type: 'saveCustomer', customer: aInput })
    await controller.execute({ type: 'saveEndpoint', customerId: a.id, endpoint: a.endpoints[0] })
    await expect(controller.execute({ type: 'saveEndpoint', customerId: a.id, endpoint: endpoint() })).rejects.toThrow('DUPLICATE_ROUTE')
    await controller.execute({ type: 'saveCustomer', customer: bInput })
    const restarted = new SimulatorRepository(path)
    const loaded = await restarted.load()
    expect(loaded.customers.map((entry) => entry.endpoints.length)).toEqual([1, 0])
    expect(loaded.selectedCustomerId).toBe(b.id)
    expect(new SimulatorController(restarted).snapshot().runtime.phase).toBe('stopped')
    await controller.execute({ type: 'selectCustomer', customerId: a.id })
    await controller.execute({ type: 'deleteCustomer', customerId: b.id })
    expect(controller.snapshot().config.selectedCustomerId).toBe(a.id)
  })
  it('copies customers atomically with independent endpoint IDs and preserves endpoints on rename', async () => {
    const { controller, repository, path } = await repositoryFixture()
    const { endpoints, ...source } = await customer([endpoint(), endpoint({ path: '/disabled', enabled: false, format: 'text', body: 'hello' })])
    await controller.execute({ type: 'saveCustomer', customer: source })
    for (const entry of endpoints) await controller.execute({ type: 'saveEndpoint', customerId: source.id, endpoint: entry })
    const copy = { ...source, id: randomUUID(), name: 'Copy' }
    const before = controller.snapshot().config
    vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('disk full'))
    await expect(controller.execute({ type: 'saveCustomer', customer: copy, sourceCustomerId: source.id })).rejects.toThrow('SAVE_FAILED')
    expect(controller.snapshot().config).toEqual(before)
    await expect(controller.execute({ type: 'saveCustomer', customer: copy, sourceCustomerId: randomUUID() })).rejects.toThrow('CUSTOMER_NOT_FOUND')
    await controller.execute({ type: 'saveCustomer', customer: copy, sourceCustomerId: source.id })
    const copied = controller.snapshot().config.customers[1]
    expect(copied.endpoints.map((entry, index) => ({ ...entry, id: endpoints[index].id }))).toEqual(endpoints)
    expect(copied.endpoints.every((entry) => !endpoints.some((original) => original.id === entry.id))).toBe(true)
    await expect(controller.execute({ type: 'saveCustomer', customer: { ...source, name: 'copy' } })).rejects.toThrow('DUPLICATE_CUSTOMER_NAME')
    await expect(controller.execute({ type: 'saveCustomer', customer: { ...copy, id: randomUUID(), name: ' COPY ' } })).rejects.toThrow('DUPLICATE_CUSTOMER_NAME')
    await expect(controller.execute({ type: 'saveCustomer', customer: copy, sourceCustomerId: source.id })).rejects.toThrow('INVALID_INPUT')
    await controller.execute({ type: 'saveCustomer', customer: { ...copy, name: 'Renamed' } })
    expect(controller.snapshot().config.customers[1].endpoints).toEqual(copied.endpoints)
    await controller.execute({ type: 'saveEndpoint', customerId: copy.id, endpoint: { ...copied.endpoints[0], body: '{"copy":true}' } })
    expect(controller.snapshot().config.customers[0].endpoints).toEqual(endpoints)
    const restarted = await new SimulatorRepository(path).load()
    expect(restarted.customers[1].name).toBe('Renamed')
    expect(restarted.customers[1].endpoints[0].body).toBe('{"copy":true}')
    expect(restarted.customers[1].host).toBe(source.host)
    expect(restarted.customers[1].port).toBe(source.port)
    expect(controller.snapshot().runtime.phase).toBe('stopped')
    await controller.execute({ type: 'start', customerId: copy.id })
    await expect(controller.execute({ type: 'saveCustomer', customer: { ...copy, id: randomUUID(), name: 'Third' }, sourceCustomerId: source.id })).rejects.toThrow('STOP_FIRST')
  })
  it('persists exact endpoint permutations, preserves live responses and rejects stale or foreign IDs', async () => {
    const { controller, repository, path } = await repositoryFixture()
    const { endpoints, ...input } = await customer([endpoint(), endpoint({ path:'/second', enabled:false })])
    await controller.execute({ type:'saveCustomer', customer:input })
    for (const entry of endpoints) await controller.execute({ type:'saveEndpoint', customerId:input.id, endpoint:entry })
    await controller.execute({ type:'start', customerId:input.id })
    const ids = endpoints.map((entry) => entry.id)
    for (const invalid of [[ids[0]], [ids[0], ids[0]], [ids[0], randomUUID()]]) {
      await expect(controller.execute({ type:'reorderEndpoints', customerId:input.id, endpointIds:invalid })).rejects.toThrow('INVALID_INPUT')
    }
    vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('disk full'))
    await expect(controller.execute({ type:'reorderEndpoints', customerId:input.id, endpointIds:[...ids].reverse() })).rejects.toThrow('SAVE_FAILED')
    expect(controller.snapshot().config.customers[0].endpoints).toEqual(endpoints)
    await controller.execute({ type:'reorderEndpoints', customerId:input.id, endpointIds:[...ids].reverse() })
    expect(controller.snapshot().config.customers[0].endpoints).toEqual([...endpoints].reverse())
    expect(await (await fetch(`http://127.0.0.1:${input.port}/api/example`)).json()).toEqual({ok:true})
    expect((await new SimulatorRepository(path).load()).customers[0].endpoints.map((entry) => entry.id)).toEqual([...ids].reverse())
  })
  it('persists before hot update, protects listeners and cleans subscriptions', async () => {
    const { controller, repository } = await repositoryFixture()
    const a = await customer()
    const { endpoints, ...input } = a
    await controller.execute({ type: 'saveCustomer', customer: input })
    await controller.execute({ type: 'saveEndpoint', customerId: a.id, endpoint: endpoints[0] })
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    await controller.execute({ type: 'start', customerId: a.id })
    expect(listener).toHaveBeenCalled()
    unsubscribe(); listener.mockClear()
    await expect(controller.execute({ type: 'saveCustomer', customer: { ...input, port: await freePort() } })).rejects.toThrow('STOP_FIRST')
    await expect(controller.execute({ type: 'deleteCustomer', customerId: a.id })).rejects.toThrow('STOP_FIRST')
    const original = endpoints[0]
    vi.spyOn(repository, 'update').mockRejectedValueOnce(new Error('disk full'))
    await expect(controller.execute({ type: 'saveEndpoint', customerId: a.id, endpoint: { ...original, body: '"changed"' } })).rejects.toThrow('SAVE_FAILED')
    expect(await (await fetch(`http://${a.host}:${a.port}${original.path}`)).json()).toEqual({ ok: true })
    expect(repository.get().customers[0].endpoints[0].body).toBe(original.body)
    await controller.execute({ type: 'setEndpointEnabled', customerId: a.id, endpointId: original.id, enabled: false })
    expect((await fetch(`http://${a.host}:${a.port}${original.path}`)).status).toBe(404)
    expect(listener).not.toHaveBeenCalled()
    await controller.shutdown()
    await expect(controller.execute({ type: 'start', customerId: a.id })).rejects.toThrow('CLOSING')
    controller.resume()
    expect((await controller.execute({ type: 'stop' })).runtime.phase).toBe('stopped')
  })
  it('backs up corruption and never replaces memory after failed writes', async () => {
    const { path, directory, repository } = await repositoryFixture()
    await writeFile(path, '{broken')
    const recovered = new SimulatorRepository(path)
    expect((await recovered.load()).customers).toEqual([])
    expect(recovered.warning).toBe('RECOVERED')
    const backup = (await readdir(directory)).find((entry) => entry.includes('.corrupt-'))!
    expect(await readFile(join(directory, backup), 'utf8')).toBe('{broken')
    await writeFile(path, '{}')
    // 目标路径变成目录，模拟原子替换失败，而非只模拟业务层错误。
    await rm(path)
    const { mkdir } = await import('node:fs/promises')
    await mkdir(path)
    const a = await customer()
    await expect(repository.update({ customers: [a], selectedCustomerId: a.id })).rejects.toThrow()
    expect(repository.get().customers).toEqual([])
  })
  it('rejects malformed network settings, routes, bodies and extra IPC fields', () => {
    expect(customerInputSchema.safeParse({ id: randomUUID(), name: 'a', host: 'example.com', port: 0, protocol: 'http' }).success).toBe(false)
    for (const patch of [{ path: 'https://evil/' }, { path: '/a?x=1' }, { path: '/a/../b' }, { body: '{' }, { body: 'x'.repeat(BODY_LIMIT + 1), format: 'text' }, { status: 100 }]) {
      expect(endpointSchema.safeParse({ ...endpoint(), ...patch }).success).toBe(false)
    }
    expect(simulatorCommandSchema.safeParse({ type: 'stop', arbitraryChannel: 'exec' }).success).toBe(false)
  })
})

describe('bounded session logs', () => {
  it('retains latest 1000, clears by customer and returns independent copies', () => {
    const buffer = new LogBuffer()
    for (let index = 0; index < 1003; index++) buffer.add({ customerId: index % 2 ? 'a' : 'b', customerName: 'test', level: 'info', code: String(index) })
    expect(buffer.get()).toHaveLength(1000)
    expect(buffer.get()[0].code).toBe('3')
    buffer.get().splice(0)
    expect(buffer.get()).toHaveLength(1000)
    buffer.clear('a'); expect(buffer.get().every((entry) => entry.customerId === 'b')).toBe(true)
    buffer.clear(null); expect(buffer.get()).toEqual([])
  })
  it('does not split UTF-8 previews or leak authentication headers', () => {
    const result = preview('文'.repeat(3000))
    expect(result.text).not.toContain('�')
    expect(Buffer.byteLength(result.text)).toBe(8190)
    expect(result.truncated).toBe(true)
    expect(redactHeaders({ 'proxy-authorization': 'secret', cookie: 'secret', accept: 'text/plain' })).toEqual({ 'proxy-authorization': '[REDACTED]', cookie: '[REDACTED]', accept: 'text/plain' })
  })
})
