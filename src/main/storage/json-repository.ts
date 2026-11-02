/**
 * 通用 JSON 仓库：负责读取、版本保护、损坏恢复及串行保存；具体 schema 由调用方注入。
 */
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
      // 文件不存在视为首次启动；其他读取失败进入只读，防止误覆盖仍存在的原文件。
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { this.readOnly = true; this.warning = 'READ_FAILED' }
      return this.get()
    }
    try {
      const value: unknown = JSON.parse(raw)
      // 更高 schema 版本可能包含当前程序不认识的字段，保留原文件并禁止保存。
      if (typeof value === 'object' && value && 'schemaVersion' in value && typeof value.schemaVersion === 'number' && value.schemaVersion > this.defaults.schemaVersion) {
        this.readOnly = true; this.warning = 'NEWER_VERSION'; return this.get()
      }
      this.current = this.parse(value)
    } catch {
      // 损坏数据先更名备份；备份也失败时只读，避免恢复默认值后把原文件冲掉。
      try { await rename(this.path, `${this.path}.corrupt-${Date.now()}`); this.warning = 'RECOVERED' }
      catch { this.readOnly = true; this.warning = 'RECOVERY_FAILED' }
    }
    return this.get()
  }
  // 返回深拷贝，调用者修改草稿不能绕过仓库校验或提前改变正式状态。
  get(): T { return structuredClone(this.current) }
  update(patch: Partial<T>): Promise<T> {
    // 在队列真正执行时读取最新 current，连续 patch 不会基于同一旧版本互相覆盖。
    const operation = this.queue.then(async () => {
      if (this.readOnly) throw new Error('SETTINGS_READ_ONLY')
      const next = this.parse({ ...this.current, ...patch })
      await mkdir(dirname(this.path), { recursive: true })
      // 先写同目录临时文件再 rename 替换；替换成功前内存继续使用旧配置。
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
