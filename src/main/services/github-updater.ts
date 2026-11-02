/**
 * 真实更新后端：封装 electron-updater，检查、下载和安装均由控制器明确调用。
 */
import { autoUpdater } from 'electron-updater'
import type { UpdateBackend } from './update-controller'
/** 仓库由构建配置决定，页面不能指定下载 URL 或注入访问令牌。 */
export function githubBackend(repository: string, installFailed: () => void): UpdateBackend {
  const [owner, repo] = repository.split('/')
  // 关闭库的自动下载与退出安装，保留检查、下载、安装三个用户可控步骤。
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = null
  autoUpdater.setFeedURL({ provider: 'github', owner, repo, private: false })
  // electron-updater 同时 reject Promise 和发出 error，监听防止 EventEmitter 未处理异常。
  autoUpdater.on('error', installFailed)
  return {
    async check() {
      const result = await autoUpdater.checkForUpdates()
      if (!result) throw new Error('UPDATE_CHECK_FAILED')
      const info = result.updateInfo
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : info.releaseNotes?.map((entry) => `${entry.version}\n${entry.note ?? ''}`).join('\n\n')
      return result.isUpdateAvailable ? { version: info.version, releaseNotes: notes?.slice(0, 32768), releaseDate: info.releaseDate } : undefined
    },
    async download(progress) {
      const listener = (value: { percent: number }) => progress(value.percent)
      autoUpdater.on('download-progress', listener)
      try { await autoUpdater.downloadUpdate() }
      // 下载结束或失败都移除进度监听，避免重试时重复推送进度。
      finally { autoUpdater.off('download-progress', listener) }
    },
    install() { autoUpdater.quitAndInstall(false, true) },
  }
}
