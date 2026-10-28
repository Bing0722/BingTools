import { BODY_LIMIT, type defaultTcpSettings } from '../../shared/schemas/simulator'
type Settings = typeof defaultTcpSettings

function markerCharacters(marker: Buffer) { return Array.from(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(marker)).length }
/** 长度包含哪些部分与字符单位在收发两侧完全一致。字符指 Unicode 码点，不是 UTF-16 单元。 */
function overhead(settings: Settings, marker: Buffer): number {
  const header = settings.lengthHeader
  if (!header || header.scope === 'body') return 0
  const fixed = (header.prefix ?? '') + (header.suffix ?? '')
  return header.width + (header.unit === 'bytes' ? Buffer.byteLength(fixed) : Array.from(fixed).length) + (header.unit === 'bytes' ? marker.length : markerCharacters(marker))
}
export function encodeTcpResponse(body: string, settings: Settings): Buffer {
  const bytes = Buffer.from(body), marker = Buffer.from(settings.delimiter, 'hex'), header = settings.lengthHeader
  if (bytes.length > BODY_LIMIT) throw new Error('PAYLOAD_TOO_LARGE')
  if (!header?.wrapResponse) return Buffer.concat([bytes, settings.appendDelimiter ? marker : Buffer.alloc(0)])
  const count = (header.unit === 'bytes' ? bytes.length : Array.from(body).length) + overhead(settings, marker)
  const prefix = count.toString(header.radix === 'hex' ? 16 : 10).toUpperCase()
  if (prefix.length > header.width) throw new Error('TCP_LENGTH_OVERFLOW')
  return Buffer.concat([Buffer.from(header.prefix ?? ''), Buffer.from(prefix.padStart(header.width, '0')), Buffer.from(header.suffix ?? ''), bytes, marker])
}

/** 每连接一份解码器。长度头模式定位到精确结束位置后才校验尾标，不搜索正文中的尾标。 */
export class TcpFrameDecoder {
  private buffer = Buffer.alloc(0)
  private expected?: number
  private scanned = 0
  private characters = 0
  private readonly marker: Buffer
  private readonly prefix: Buffer
  private readonly suffix: Buffer
  constructor(private readonly settings: Settings) {
    this.marker = Buffer.from(settings.delimiter, 'hex')
    this.prefix = Buffer.from(settings.lengthHeader?.prefix ?? '')
    this.suffix = Buffer.from(settings.lengthHeader?.suffix ?? '')
  }
  clear() { this.buffer = Buffer.alloc(0); this.expected = undefined; this.scanned = 0; this.characters = 0 }
  push(chunk: Buffer, emit: (body: Buffer) => boolean | void) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const header = this.settings.lengthHeader
    while (true) {
      if (!header) {
        const end = this.buffer.indexOf(this.marker)
        if (end < 0) {
          if (this.buffer.length > BODY_LIMIT + this.marker.length - 1) throw new Error('PAYLOAD_TOO_LARGE')
          return
        }
        if (end > BODY_LIMIT) throw new Error('PAYLOAD_TOO_LARGE')
        const body = this.buffer.subarray(0, end)
        this.buffer = this.buffer.subarray(end + this.marker.length)
        if (emit(body) === false) return
        continue
      }
      const bodyOffset = this.prefix.length + header.width + this.suffix.length
      if (this.expected === undefined) {
        // 固定包装也允许跨 data 分片；只校验预定位置，不搜索或跳过未知字节。
        if (!this.buffer.subarray(0, Math.min(this.buffer.length, this.prefix.length)).equals(this.prefix.subarray(0, this.buffer.length))) throw new Error('TCP_INVALID_HEADER')
        if (this.buffer.length < bodyOffset) return
        if (!this.buffer.subarray(this.prefix.length + header.width, bodyOffset).equals(this.suffix)) throw new Error('TCP_INVALID_HEADER')
        const prefix = this.buffer.subarray(this.prefix.length, this.prefix.length + header.width).toString('latin1')
        if (!(header.radix === 'hex' ? /^[0-9A-Fa-f]+$/ : /^[0-9]+$/).test(prefix)) throw new Error('TCP_INVALID_LENGTH')
        this.expected = parseInt(prefix, header.radix === 'hex' ? 16 : 10) - overhead(this.settings, this.marker)
        if (!Number.isSafeInteger(this.expected) || this.expected < 0) throw new Error('TCP_INVALID_LENGTH')
        if (this.expected > BODY_LIMIT) throw new Error('PAYLOAD_TOO_LARGE')
      }
      let size = this.expected
      if (header.unit === 'characters') {
        // 扫描进度跨 data 事件保留，中文和 emoji 的 UTF-8 半字符不会被提前计数。
        while (this.characters < this.expected) {
          const offset = bodyOffset + this.scanned
          if (offset >= this.buffer.length) return
          const first = this.buffer[offset]
          const width = first < 0x80 ? 1 : first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : first >= 0xf0 && first <= 0xf4 ? 4 : 0
          if (!width) throw new Error('TCP_INVALID_MESSAGE')
          if (this.scanned + width > BODY_LIMIT) throw new Error('PAYLOAD_TOO_LARGE')
          if (offset + width > this.buffer.length) return
          // 严格检查续字节、过长编码和代理区，避免错误长度吞掉下一帧。
          for (let i = 1; i < width; i++) if ((this.buffer[offset + i] & 0xc0) !== 0x80) throw new Error('TCP_INVALID_MESSAGE')
          const second = this.buffer[offset + 1]
          if ((first === 0xe0 && second < 0xa0) || (first === 0xed && second >= 0xa0) || (first === 0xf0 && second < 0x90) || (first === 0xf4 && second >= 0x90)) throw new Error('TCP_INVALID_MESSAGE')
          this.scanned += width; this.characters++
        }
        size = this.scanned
      }
      const end = bodyOffset + size
      if (this.buffer.length < end + this.marker.length) return
      if (!this.buffer.subarray(end, end + this.marker.length).equals(this.marker)) throw new Error('TCP_INVALID_END_MARKER')
      const body = this.buffer.subarray(bodyOffset, end)
      this.buffer = this.buffer.subarray(end + this.marker.length)
      this.expected = undefined; this.scanned = 0; this.characters = 0
      if (emit(body) === false) return
    }
  }
}
