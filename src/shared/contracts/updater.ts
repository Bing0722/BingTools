export type UpdatePhase = 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'downloaded' | 'installing' | 'error'
export interface UpdateSnapshot {
  revision: number
  mode: 'demo' | 'github' | 'unavailable'
  currentVersion: string
  repository?: string
  phase: UpdatePhase
  version?: string
  progress: number
  error?: string
}
