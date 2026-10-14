import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import { PREVIEW_LIMIT } from '../../shared/schemas/simulator'
import type { LogEntry } from '../../shared/contracts/simulator'

/** 日志仅存在内存中，头信息统一脱敏；预览按 UTF-8 字节限长。 */
export function preview(value: string | Buffer): { text: string; truncated: boolean } {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  let end = Math.min(bytes.length, PREVIEW_LIMIT)
  // 不截断多字节字符，避免预览末尾出现乱码。
  if (end < bytes.length) while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--
  return { text: bytes.subarray(0, end).toString('utf8'), truncated: bytes.length > end }
}
export function redactHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key,
    /authorization|cookie|token|api[-_]?key|secret/i.test(key) ? '[REDACTED]' : preview(Array.isArray(value) ? value.join(', ') : value ?? '').text,
  ]))
}
export class LogBuffer {
  private entries: LogEntry[] = []
  add(entry: Omit<LogEntry, 'id' | 'time'>): LogEntry {
    const record = { ...entry, id: randomUUID(), time: Date.now() }
    this.entries.push(record)
    if (this.entries.length > 1000) this.entries.splice(0, this.entries.length - 1000)
    return record
  }
  get(): LogEntry[] { return structuredClone(this.entries) }
  clear(customerId: string | null): void {
    this.entries = customerId ? this.entries.filter((entry) => entry.customerId !== customerId) : []
  }
}
