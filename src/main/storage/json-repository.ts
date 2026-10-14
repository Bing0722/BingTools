import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** 先写磁盘再替换内存；失败不会污染已经生效的配置。 */
export class JsonRepository<T extends { schemaVersion: number }> {
  private current: T
  private queue: Promise<void> = Promise.resolve()
  private readOnly = false
  warning?: string
  constructor(private readonly path: string, private readonly defaults: T, private readonly parse: (value: unknown) => T) {
    this.current = structuredClone(defaults)
  }
  async load(): Promise<T> {
    let raw: string
    try { raw = await readFile(this.path, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.readOnly = true; this.warning = 'READ_FAILED' }
      return this.get()
    }
    try {
      const value: unknown = JSON.parse(raw)
      if (typeof value === 'object' && value && 'schemaVersion' in value && typeof value.schemaVersion === 'number' && value.schemaVersion > this.defaults.schemaVersion) {
        this.readOnly = true; this.warning = 'NEWER_VERSION'; return this.get()
      }
      this.current = this.parse(value)
    } catch {
      try { await rename(this.path, `${this.path}.corrupt-${Date.now()}`); this.warning = 'RECOVERED' }
      catch { this.readOnly = true; this.warning = 'RECOVERY_FAILED' }
    }
    return this.get()
  }
  get(): T { return structuredClone(this.current) }
  update(patch: Partial<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      if (this.readOnly) throw new Error('SETTINGS_READ_ONLY')
      const next = this.parse({ ...this.current, ...patch })
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(`${this.path}.tmp`, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
      await rename(`${this.path}.tmp`, this.path)
      this.current = next
      return this.get()
    })
    // 失败被调用方处理，保存队列仍能继续工作。
    this.queue = operation.then(() => undefined, () => undefined)
    return operation
  }
  async flush(): Promise<void> { await this.queue }
}
