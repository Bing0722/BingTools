import type { UpdateSnapshot } from '../../shared/contracts/updater'
export interface UpdateBackend {
  check(): Promise<string | { version: string; releaseNotes?: string; releaseDate?: string } | undefined>
  download(progress: (percent: number) => void): Promise<void>
  install(): void
}
/** 更新状态仅存在内存。默认演示后端不访问网络、不写文件、不重启。 */
export class UpdateController {
  private state: UpdateSnapshot
  private listeners = new Set<(state: UpdateSnapshot) => void>()
  constructor(private backend: UpdateBackend, options: Pick<UpdateSnapshot, 'mode' | 'currentVersion' | 'repository' | 'canInstall'>, private prepareInstall: () => Promise<void> = async () => {}, private recoverInstall: () => void = () => {}) {
    this.state = { ...options, phase: 'idle', progress: 0, revision: 0 }
  }
  snapshot(): UpdateSnapshot { return { ...this.state } }
  subscribe(listener: (state: UpdateSnapshot) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(patch: Partial<UpdateSnapshot>) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }
    for (const listener of this.listeners) listener(this.snapshot())
  }
  private assertAvailable() {
    if (this.state.mode === 'unavailable') throw new Error('UPDATE_PACKAGED_ONLY')
    if (['checking', 'downloading', 'installing'].includes(this.state.phase)) throw new Error('UPDATE_BUSY')
  }
  async check(): Promise<UpdateSnapshot> {
    this.assertAvailable()
    if (this.state.phase === 'downloaded') throw new Error('UPDATE_ALREADY_DOWNLOADED')
    this.set({ phase: 'checking', error: undefined, progress: 0, version: undefined, releaseNotes: undefined, releaseDate: undefined })
    try {
      const result = await this.backend.check()
      const info = typeof result === 'string' ? { version: result } : result
      this.set({ phase: info ? 'available' : 'current', ...info })
    } catch { this.set({ phase: 'error', error: 'UPDATE_CHECK_FAILED' }) }
    return this.snapshot()
  }
  async download(): Promise<UpdateSnapshot> {
    this.assertAvailable()
    if (this.state.canInstall === false) throw new Error('UPDATE_MANUAL_ONLY')
    if (this.state.phase !== 'available') throw new Error('UPDATE_CHECK_FIRST')
    this.set({ phase: 'downloading', error: undefined, progress: 0 })
    try {
      await this.backend.download((percent) => this.set({ progress: Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0)) }))
      this.set({ phase: 'downloaded', progress: 100 })
    } catch { this.set({ phase: 'error', error: 'UPDATE_DOWNLOAD_FAILED' }) }
    return this.snapshot()
  }
  installFailed(): void {
    if (this.state.phase !== 'installing') return
    this.recoverInstall()
    this.set({ phase: 'error', error: 'UPDATE_INSTALL_FAILED' })
  }
  async install(): Promise<UpdateSnapshot> {
    this.assertAvailable()
    if (this.state.canInstall === false) throw new Error('UPDATE_MANUAL_ONLY')
    if (this.state.mode === 'demo') throw new Error('UPDATE_DEMO_ONLY')
    if (this.state.phase !== 'downloaded') throw new Error('UPDATE_DOWNLOAD_FIRST')
    this.set({ phase: 'installing', error: undefined })
    try { await this.prepareInstall(); this.backend.install() }
    catch { this.installFailed() }
    return this.snapshot()
  }
}
export function demoBackend(version: string): UpdateBackend {
  const sampleVersion = version.replace(/^(\d+)\.(\d+)\.(\d+).*$/, (_all, major, minor, patch) => `${major}.${minor}.${Number(patch) + 1}`)
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 180))
  return {
    async check() { await pause(); return sampleVersion },
    async download(progress) { for (const percent of [10, 30, 55, 80, 100]) { await pause(); progress(percent) } },
    install() { throw new Error('UPDATE_DEMO_ONLY') },
  }
}
