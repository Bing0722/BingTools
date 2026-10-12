import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { defaultSettings, settingsSchema, type AppSettings } from '../../shared/schemas/settings'

export class SettingsRepository {
  private current: AppSettings = { ...defaultSettings }
  private queue: Promise<void> = Promise.resolve()
  private readOnly = false
  warning?: string

  constructor(private readonly path: string) {}

  async load(): Promise<AppSettings> {
    let raw: string
    try { raw = await readFile(this.path, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.get()
      this.readOnly = true
      this.warning = '无法读取设置文件。当前使用默认设置，请检查文件权限后重启。'
      return this.get()
    }
    try {
      const data: unknown = JSON.parse(raw)
      if (typeof data === 'object' && data !== null && 'schemaVersion' in data &&
          typeof data.schemaVersion === 'number' && data.schemaVersion > 1) {
        this.readOnly = true
        this.warning = '设置来自更新版本，当前以默认设置运行，原文件不会被覆盖。'
        return this.get()
      }
      this.current = settingsSchema.parse(data)
    } catch {
      try {
        await rename(this.path, `${this.path}.corrupt-${Date.now()}`)
        this.warning = '设置文件损坏，已保留备份并恢复默认设置。'
      } catch {
        this.readOnly = true
        this.warning = '设置文件无法恢复，原文件已保留；当前设置暂时不能保存。'
      }
    }
    return this.get()
  }

  get(): AppSettings { return structuredClone(this.current) }

  update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const operation = this.queue.then(async () => {
      if (this.readOnly) throw new Error('SETTINGS_READ_ONLY')
      const next = settingsSchema.parse({ ...this.current, ...patch })
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(`${this.path}.tmp`, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
      await rename(`${this.path}.tmp`, this.path)
      this.current = next
      return this.get()
    })
    this.queue = operation.then(() => undefined, () => undefined)
    return operation
  }

  async flush(): Promise<void> { await this.queue }
}
