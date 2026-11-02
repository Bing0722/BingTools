/**
 * 更新快照契约：phase 表示阶段，mode 区分演示、真实来源和开发环境不可用状态。
 */
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'installing' | 'error'
export interface UpdateSnapshot {
  revision: number
  mode: 'demo' | 'github' | 'unavailable'
  currentVersion: string
  repository?: string
  phase: UpdatePhase
  version?: string
  releaseNotes?: string
  releaseDate?: string
  canInstall?: boolean
  // 下载百分比由主进程限制在 0–100；错误使用稳定代码供页面即时翻译。
  progress: number
  error?: string
}
