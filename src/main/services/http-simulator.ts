/**
 * HTTP 服务实现：请求开始时确定响应规则，限制正文大小，结束时记录脱敏预览。
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { performance } from 'node:perf_hooks'
import { BODY_LIMIT, type Customer } from '../../shared/schemas/simulator'
import type { LogEntry, RuntimeState } from '../../shared/contracts/simulator'
import { preview, redactHeaders } from './log-buffer'

type Callbacks = { state: (state: RuntimeState) => void; log: (entry: Omit<LogEntry, 'id' | 'time'>) => void }
export class HttpSimulator {
  private readonly pendingResponses = new Map<ServerResponse, ReturnType<typeof setTimeout>>()
  private cancelPendingResponses(): void {
    // 停服立即取消延时并断开等待连接，不让旧定时器跨越服务生命周期。
    for (const [response, timer] of this.pendingResponses) { clearTimeout(timer); response.destroy() }
    this.pendingResponses.clear()
  }
  private server?: Server
  private customer?: Customer
  private state: RuntimeState = { phase: 'stopped' }
  constructor(private readonly callbacks: Callbacks) {}
  getState(): RuntimeState { return { ...this.state } }
  private setState(state: RuntimeState) { this.state = state; this.callbacks.state(this.getState()) }
  setCustomer(customer: Customer): void { this.customer = structuredClone(customer) }
  private event(code: string, level: LogEntry['level']) {
    if (this.customer) this.callbacks.log({ customerId: this.customer.id, customerName: this.customer.name, code, level })
  }
  async start(customer: Customer): Promise<void> {
    if (this.server) throw new Error('ALREADY_RUNNING')
    this.setCustomer(customer)
    const identity = { customerId: customer.id, host: customer.host, port: customer.port }
    this.setState({ ...identity, phase: 'starting' })
    const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => this.handle(request, response))
    this.server = server
    // 分别限制请求、头部和连接空闲时间，避免异常客户端长时间占用资源。
    server.requestTimeout = 15000
    server.headersTimeout = 10000
    server.timeout = 15000
    server.on('timeout', (socket) => socket.destroy())
    server.on('clientError', (_error, socket) => {
      this.event('BAD_REQUEST', 'warn')
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      else socket.destroy()
    })
    server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'))
    server.on('connect', (_request, socket) => socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n'))
    try {
      await new Promise<void>((resolve, reject) => {
        const fail = (error: Error) => { server.off('listening', ready); reject(error) }
        const ready = () => { server.off('error', fail); resolve() }
        // 监听真正就绪才进入 running；启动失败监听器与运行期异常监听器分开处理。
        server.once('error', fail); server.once('listening', ready)
        server.listen(customer.port, customer.host)
      })
      server.on('error', () => {
        this.setState({ ...identity, phase: 'failed', error: 'SERVER_ERROR' })
        this.event('SERVER_ERROR', 'error')
        // 异常后释放监听资源，不留下表面失败但仍占端口的实例。
        this.cancelPendingResponses()
        server.close(); server.closeAllConnections(); this.server = undefined
      })
      this.setState({ ...identity, phase: 'running' })
      this.event('SERVER_STARTED', 'info')
    } catch (error) {
      this.server = undefined
      const systemCode = (error as NodeJS.ErrnoException).code
      const code = systemCode === 'EADDRINUSE' ? 'PORT_IN_USE' : systemCode === 'EADDRNOTAVAIL' ? 'ADDRESS_UNAVAILABLE' : systemCode === 'EACCES' ? 'BIND_DENIED' : 'START_FAILED'
      this.setState({ ...identity, phase: 'failed', error: code })
      this.event(code, 'error')
      throw new Error(code, { cause: error })
    }
  }
  async stop(): Promise<void> {
    const server = this.server
    if (!server) { this.setState({ phase: 'stopped' }); return }
    this.setState({ ...this.state, phase: 'stopping', error: undefined })
    this.cancelPendingResponses()
    // 正常连接最多等待三秒；超时强制断开，保证关闭窗口不会无限等待。
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => { server.closeAllConnections(); resolve() }, 3000)
      server.close(() => { clearTimeout(timer); resolve() })
      server.closeIdleConnections()
    })
    this.server = undefined
    this.setState({ phase: 'stopped' })
    this.event('SERVER_STOPPED', 'info')
  }
  private handle(request: IncomingMessage, response: ServerResponse): void {
    // 请求开始时取一份配置快照，运行中保存仅影响后续请求。
    const customer = this.customer
    if (!customer) { response.writeHead(503).end(); return }
    const started = performance.now()
    const method = request.method ?? 'GET'
    let path: string
    try { path = new URL(request.url ?? '/', 'http://localhost').pathname }
    catch { response.writeHead(400).end(); return }
    // 匹配只使用方法和 URL pathname，查询参数不参与；关闭的接口等同于不存在。
    const endpoint = customer.endpoints.find((entry) => entry.enabled && entry.method === method && entry.path === path)
    let size = 0
    let finished = false
    let previewBytes = 0
    const chunks: Buffer[] = []
    // finished 防止超限、请求结束等多个事件重复写响应；日志在响应 finish 时生成。
    const reply = (status: number, body: string, format: string, code: string) => {
      if (finished || response.destroyed) return
      finished = true
      // HEAD 与 204/304 按 HTTP 语义不发送正文，即使接口保存了响应内容。
      const outgoing = method === 'HEAD' || status === 204 || status === 304 ? '' : body
      const inbound = preview(Buffer.concat(chunks))
      const outbound = preview(outgoing)
      response.on('finish', () => this.callbacks.log({
        customerId: customer.id, customerName: customer.name, level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        code, method, path, status, duration: Math.round((performance.now() - started) * 10) / 10,
        requestHeaders: redactHeaders(request.headers), requestPreview: inbound.text, responsePreview: outbound.text,
        requestTruncated: size > Buffer.byteLength(inbound.text), responseTruncated: outbound.truncated,
      }))
      response.writeHead(status, {
        'Content-Type': format === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        ...(status === 413 ? { Connection: 'close' } : {}),
      })
      response.end(outgoing)
    }
    // 对端提前断开时也清除延时计时器，避免等待表残留无效连接。
    response.once('close', () => {
      const timer = this.pendingResponses.get(response)
      if (timer) clearTimeout(timer)
      this.pendingResponses.delete(response)
    })
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      // 预览只收集前 8KiB 左右，限制正文缓存，不把整个请求保存在日志中。
      if (previewBytes < 8196) {
        const part = chunk.subarray(0, 8196 - previewBytes)
        chunks.push(part); previewBytes += part.length
      }
      if (size > BODY_LIMIT) reply(413, 'Payload too large', 'text', 'PAYLOAD_TOO_LARGE')
    })
    request.on('end', () => {
      if (finished || response.destroyed) return
      if (!endpoint) reply(404, 'Not found', 'text', 'NOT_FOUND')
      else if (endpoint.responseDelay?.enabled && endpoint.responseDelay.ms > 0) {
        if (this.state.phase !== 'running') { response.destroy(); return }
        if (this.pendingResponses.size >= 256) { reply(503, 'Too many pending responses', 'text', 'SERVER_ERROR'); return }
        // 正文接收完后才延时，关闭此连接的空闲计时以支持超过 15 秒的配置。
        response.setTimeout(0)
        const timer = setTimeout(() => {
          this.pendingResponses.delete(response)
          reply(endpoint.status, endpoint.body, endpoint.format, 'HTTP_REQUEST')
        }, endpoint.responseDelay.ms)
        this.pendingResponses.set(response, timer)
      } else reply(endpoint.status, endpoint.body, endpoint.format, 'HTTP_REQUEST')
    })
    request.on('error', () => {
      if (!finished) this.callbacks.log({ customerId: customer.id, customerName: customer.name, code: 'REQUEST_ABORTED', level: 'warn', method, path })
    })
    // 已声明超限时直接拒绝；data 中仍按实际收到的字节累计，不能只信任请求头。
    if (Number(request.headers['content-length']) > BODY_LIMIT) reply(413, 'Payload too large', 'text', 'PAYLOAD_TOO_LARGE')
  }
}
