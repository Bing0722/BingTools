import { autoUpdater } from 'electron-updater'
import type { UpdateBackend } from './update-controller'
/** 仓库由构建配置决定，页面不能指定下载 URL 或注入访问令牌。 */
export function githubBackend(repository: string, installFailed: () => void): UpdateBackend {
  const [owner, repo] = repository.split('/')
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
      return result.isUpdateAvailable ? result.updateInfo.version : undefined
    },
    async download(progress) {
      const listener = (value: { percent: number }) => progress(value.percent)
      autoUpdater.on('download-progress', listener)
      try { await autoUpdater.downloadUpdate() }
      finally { autoUpdater.off('download-progress', listener) }
    },
    install() { autoUpdater.quitAndInstall(false, true) },
  }
}
