import { TcpFrameDecoder, encodeTcpResponse } from './tcp-framing'
import { createServer, type Server, type Socket } from 'node:net'
import { performance } from 'node:perf_hooks'
import { BODY_LIMIT, defaultTcpSettings, type Customer } from '../../shared/schemas/simulator'
import type { LogEntry, RuntimeState } from '../../shared/contracts/simulator'
import { preview } from './log-buffer'

type Callbacks = { state: (state: RuntimeState) => void; log: (entry: Omit<LogEntry, 'id' | 'time'>) => void }
export function extractTcpName(text: string, settings = defaultTcpSettings): string | undefined {
  if (settings.extraction === 'text') return settings.separator ? text.split(settings.separator, settings.index + 1)[settings.index] : text
  let value: unknown = JSON.parse(text)
  for (const key of settings.field.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key) || ['__proto__', 'constructor', 'prototype'].includes(key)) return undefined
    value = (value as Record<string, unknown>)[key]
  }
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
}

/** TCP 只在主进程监听。每个连接独立分帧，缓冲、连接数和待写数据均有上限。 */
export class TcpSimulator {
  private server?: Server
  private sockets = new Set<Socket>()
  private customer?: Customer
  private state: RuntimeState = { phase: 'stopped' }
  constructor(private readonly callbacks: Callbacks) {}
  getState(): RuntimeState { return { ...this.state } }
  private setState(value: RuntimeState) { this.state = value; this.callbacks.state(this.getState()) }
  setCustomer(customer: Customer) { this.customer = structuredClone(customer) }
  private event(code: string, level: LogEntry['level']) {
    if (this.customer) this.callbacks.log({ customerId: this.customer.id, customerName: this.customer.name, code, level, method: 'TCP' })
  }
  async start(customer: Customer) {
    if (this.server) throw new Error('ALREADY_RUNNING')
    this.setCustomer(customer)
    const identity = { customerId: customer.id, host: customer.host, port: customer.port }
    this.setState({ ...identity, phase: 'starting' })
    const server = createServer((socket) => this.accept(socket))
    this.server = server
    server.maxConnections = 64
    try {
      await new Promise<void>((resolve, reject) => {
        const fail = (error: Error) => { server.off('listening', ready); reject(error) }
        const ready = () => { server.off('error', fail); resolve() }
        server.once('error', fail); server.once('listening', ready)
        server.listen(customer.port, customer.host)
      })
      server.on('error', () => {
        this.setState({ ...identity, phase: 'failed', error: 'SERVER_ERROR' }); this.event('SERVER_ERROR', 'error')
        for (const socket of this.sockets) socket.destroy()
        server.close(); this.server = undefined
      })
      this.setState({ ...identity, phase: 'running' }); this.event('SERVER_STARTED', 'info')
    } catch (error) {
      this.server = undefined
      const systemCode = (error as NodeJS.ErrnoException).code
      const code = systemCode === 'EADDRINUSE' ? 'PORT_IN_USE' : systemCode === 'EADDRNOTAVAIL' ? 'ADDRESS_UNAVAILABLE' : systemCode === 'EACCES' ? 'BIND_DENIED' : 'START_FAILED'
      this.setState({ ...identity, phase: 'failed', error: code }); this.event(code, 'error')
      throw new Error(code, { cause: error })
    }
  }
  async stop() {
    const server = this.server
    if (!server) { this.setState({ phase: 'stopped' }); return }
    this.setState({ ...this.state, phase: 'stopping', error: undefined })
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { for (const socket of this.sockets) socket.destroy(); resolve() }, 3000)
      server.close(() => { clearTimeout(timer); resolve() })
      for (const socket of this.sockets) socket.end()
    })
    this.server = undefined
    this.setState({ phase: 'stopped' }); this.event('SERVER_STOPPED', 'info')
  }
  private accept(socket: Socket) {
    this.sockets.add(socket)
    const settings = this.customer?.tcp ?? defaultTcpSettings
    const decoder = new TcpFrameDecoder(settings)
    socket.setTimeout(60000, () => socket.destroy())
    socket.on('error', () => this.event('TCP_CONNECTION_ERROR', 'warn'))
    socket.on('close', () => { this.sockets.delete(socket); decoder.clear() })
    socket.on('data', (chunk: Buffer) => {
      if (this.state.phase !== 'running') return
      try {
        decoder.push(chunk, (frame) => { this.handle(socket, frame); return !socket.destroyed })
      } catch (error) {
        // 长度或尾标损坏后无法可靠重同步，丢弃该连接，绝不猜测正文边界。
        const code = error instanceof Error && ['TCP_INVALID_HEADER', 'TCP_INVALID_LENGTH', 'TCP_INVALID_END_MARKER', 'PAYLOAD_TOO_LARGE'].includes(error.message) ? error.message : 'TCP_INVALID_MESSAGE'
        this.event(code, 'warn'); decoder.clear(); socket.destroy()
      }
    })
  }
  private handle(socket: Socket, frame: Buffer) {
    const customer = this.customer
    if (!customer) return
    const started = performance.now(), settings = customer.tcp ?? defaultTcpSettings
    let name: string | undefined, code = 'TCP_REQUEST', response = ''
    try {
      name = extractTcpName(new TextDecoder('utf-8', { fatal: true }).decode(frame), settings)
      if (name === undefined || !name.length) code = 'TCP_FIELD_MISSING'
      else {
        const endpoint = customer.endpoints.find((entry) => entry.enabled && entry.name === name)
        // JSON 仅移除字符串外空白，保留大整数和转义，避免美化换行成为分帧符。
        if (endpoint) response = endpoint.format === 'json' ? endpoint.body.replace(/"(?:\\.|[^"\\])*"|[ \t\r\n]+/g, (token) => token.startsWith('"') ? token : '') : endpoint.body
        else code = 'NOT_FOUND'
      }
    } catch { code = 'TCP_INVALID_MESSAGE' }
    // 未匹配或解析失败仅记录日志，不向自定义协议注入 HTTP 错误文本。
    if (code === 'TCP_REQUEST') {
      try {
        const outgoing = encodeTcpResponse(response, settings)
        if (socket.writableLength + outgoing.length > 2 * BODY_LIMIT + 64) { code = 'TCP_BACKPRESSURE'; socket.destroy() }
        else socket.write(outgoing)
      } catch (error) {
        code = error instanceof Error && error.message === 'TCP_LENGTH_OVERFLOW' ? error.message : 'TCP_INVALID_MESSAGE'
      }
    }
    const inbound = preview(frame), outbound = preview(response)
    this.callbacks.log({ customerId: customer.id, customerName: customer.name, method: 'TCP', path: name ? preview(name).text : undefined,
      code, level: code === 'TCP_REQUEST' ? 'info' : 'warn', duration: Math.round((performance.now() - started) * 10) / 10,
      requestPreview: inbound.text, responsePreview: code === 'TCP_REQUEST' ? outbound.text : '', requestTruncated: inbound.truncated, responseTruncated: outbound.truncated })
  }
}
