import { SERIAL_FRAME_LIMIT, type SerialSettings } from '../../shared/schemas/motion'

/** 串口 data 事件不是消息边界；缓存半包并拆分粘包，始终限制内存。 */
export class SerialFramer {
  private buffer = Buffer.alloc(0)
  private discarding = false
  private timer?: ReturnType<typeof setTimeout>
  constructor(private settings: SerialSettings, private frame: (value: Buffer) => void, private overflow: () => void) {}
  feed(chunk: Buffer) {
    clearTimeout(this.timer)
    // 分块处理大批输入，避免单个粘包造成无界临时缓存。
    for (let offset = 0; offset < chunk.length; offset += 4096) {
      this.buffer = Buffer.concat([this.buffer, chunk.subarray(offset, offset + 4096)])
      if (this.settings.framing === 'length') {
        while (this.buffer.length >= this.settings.frameLength) this.consume(this.settings.frameLength, 0)
      } else if (this.settings.framing === 'delimiter') {
        const delimiter = Buffer.from(this.settings.delimiter, 'hex')
        let index: number
        while ((index = this.buffer.indexOf(delimiter)) >= 0) {
          if (this.discarding) { this.buffer = this.buffer.subarray(index + delimiter.length); this.discarding = false }
          else this.consume(index, delimiter.length)
        }
        if (this.discarding) this.buffer = this.buffer.subarray(Math.max(0, this.buffer.length - delimiter.length + 1))
      }
      if (this.buffer.length > SERIAL_FRAME_LIMIT + (this.settings.framing === 'delimiter' ? this.settings.delimiter.length / 2 : 0)) {
        this.discarding = true
        this.buffer = this.settings.framing === 'delimiter' ? this.buffer.subarray(this.buffer.length - this.settings.delimiter.length / 2 + 1) : Buffer.alloc(0)
        this.overflow()
      }
      if (this.discarding && this.settings.framing === 'idle') this.buffer = Buffer.alloc(0)
    }
    if (this.settings.framing === 'idle' && (this.buffer.length || this.discarding)) this.timer = setTimeout(() => { if (!this.discarding) this.consume(this.buffer.length, 0); this.discarding = false }, this.settings.idleMs)
  }
  private consume(length: number, suffix: number) {
    const frame = Buffer.from(this.buffer.subarray(0, length))
    this.buffer = this.buffer.subarray(length + suffix)
    if (frame.length > SERIAL_FRAME_LIMIT) this.overflow()
    else if (frame.length) this.frame(frame)
  }
  dispose() { clearTimeout(this.timer); this.buffer = Buffer.alloc(0); this.discarding = false }
}
