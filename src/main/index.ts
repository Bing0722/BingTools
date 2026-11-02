/**
 * 主进程入口：加载本地配置、注册受控 IPC、创建窗口，并统一处理停服和退出。
 * 阅读业务细节可继续进入 services 下的控制器；页面不能直接调用这里的系统能力。
 */
import { registerTransfer } from './ipc/transfer'
import { MotionController, MotionRepository } from './services/motion-controller'
import { registerMotion } from './ipc/motion'
import { app, BrowserWindow, nativeTheme, screen, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SettingsRepository } from './storage/settings-repository'
import { registerSettings } from './ipc/settings'
import { SimulatorRepository } from './storage/simulator-repository'
import { SimulatorController } from './services/simulator-controller'
import { registerSimulator } from './ipc/simulator'
import { UpdateController, demoBackend } from './services/update-controller'
import { registerUpdater } from './ipc/updater'
declare const __UPDATE_REPOSITORY__: string
declare const __MAC_SIGNED__: boolean
import { updateMenu } from './menu'

app.setName('BingTools')
// 测试使用独立数据目录，不读取或改写用户正式设置。
if (!app.isPackaged && process.env.BINGTOOLS_TEST_DATA) app.setPath('userData', process.env.BINGTOOLS_TEST_DATA)
let window: BrowserWindow | null = null
// quitting 允许最终退出，closing 允许最终关窗；第一次事件先被拦截，等待资源释放。
let quitting = false
let closing = false
let boundsTimer: ReturnType<typeof setTimeout> | undefined
const repository = new SettingsRepository(join(app.getPath('userData'), 'settings.json'))
const simulatorRepository = new SimulatorRepository(join(app.getPath('userData'), 'simulator.json'))
const simulator = new SimulatorController(simulatorRepository)
const motionRepository = new MotionRepository(join(app.getPath('userData'), 'motion.json'))
const motion = new MotionController(motionRepository)
let shutdownPromise: Promise<void> | undefined
function shutdown(): Promise<void> {
  // 窗口关闭与应用退出可能重入，复用同一个释放过程。
  return shutdownPromise ??= Promise.all([repository.flush(), simulator.shutdown(), motion.shutdown()]).then(() => undefined)
}
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
const rendererFile = join(__dirname, '../renderer/index.html')
const expectedUrl = devUrl ? new URL(devUrl).href : pathToFileURL(rendererFile).href

function saveBounds(): void {
  if (!window || window.isDestroyed() || window.isMaximized() || window.isMinimized()) return
  void repository.update({ windowBounds: window.getBounds() }).catch(() => {
    console.warn('[settings] Window bounds could not be saved')
  })
}

// Windows 原生窗口按钮与应用标题栏共用主题；跟随系统时也同步更新。
function overlayStyle() {
  return { height: 56, color: nativeTheme.shouldUseDarkColors ? '#18181B' : '#FFFFFF',
    symbolColor: nativeTheme.shouldUseDarkColors ? '#F4F4F5' : '#202024' }
}
nativeTheme.on('updated', () => {
  if (process.platform === 'win32' && window && !window.isDestroyed()) window.setTitleBarOverlay(overlayStyle())
})

function createWindow(): void {
  closing = false
  shutdownPromise = undefined
  simulator.resume()
  motion.resume()
  const settings = repository.get()
  nativeTheme.themeSource = settings.theme
  const workArea = screen.getPrimaryDisplay().workArea
  const saved = settings.windowBounds
  // 只恢复完整落在某个显示器工作区内的窗口，避免移除显示器后窗口留在屏幕外。
  const visible = saved && screen.getAllDisplays().some(({ workArea: area }) =>
    saved.x >= area.x && saved.y >= area.y && saved.x + saved.width <= area.x + area.width &&
    saved.y + saved.height <= area.y + area.height)
  window = new BrowserWindow({
    width: Math.min(1200, workArea.width), height: Math.min(800, workArea.height),
    ...(visible ? saved : {}),
    minWidth: Math.min(800, workArea.width), minHeight: Math.min(560, workArea.height),
    show: false,
    title: 'BingTools',
    // 顶部统一预留 56px；保留原生按钮及系统最大化、贴靠行为。
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 21 } }
      : process.platform === 'win32'
        ? { titleBarStyle: 'hidden' as const, titleBarOverlay: overlayStyle() }
        : {}),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#18181B' : '#FFFFFF',
    // 页面处于沙箱且没有 Node；仅 preload 提供按用途划分的有限能力。
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
      // 工具字段包含路径、协议和 JSON，关闭自然语言拼写标记。
      spellcheck: false,
    },
  })
  window.webContents.session.setSpellCheckerEnabled(false)
  // 禁止页面打开新窗口或导航到其他文档，保持 IPC 的可信文档边界。
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('resize', queueBounds)
  window.on('move', queueBounds)
  // 第一次关闭先保存窗口位置并停服，完成后再次 close 才真正销毁窗口。
  window.on('close', (event) => {
    if (closing) return
    event.preventDefault()
    clearTimeout(boundsTimer)
    saveBounds()
    void shutdown().then(() => { closing = true; window?.close() })
  })
  window.on('closed', () => { window = null })
  window.once('ready-to-show', () => window?.show())
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(rendererFile)
}
// 拖动与缩放会连续触发事件，300ms 防抖避免每一帧都写设置文件。
function queueBounds(): void {
  clearTimeout(boundsTimer)
  boundsTimer = setTimeout(saveBounds, 300)
}

void app.whenReady().then(async () => {
  // 先完成三份配置的恢复和迁移，再创建窗口，防止默认值覆盖已有偏好。
  await Promise.all([repository.load(), simulatorRepository.load(), motionRepository.load()])
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // 开发模式允许本地热更新连接；生产页面不能自行发起网络连接。
    const csp = devUrl
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; base-uri 'none'; frame-src 'none'"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
  registerSettings(repository, () => window, expectedUrl, updateMenu)
  registerSimulator(simulator, () => window, expectedUrl)
  registerMotion(motion, () => window, expectedUrl)
  registerTransfer(simulator, motion, () => window, expectedUrl)
  const updateRepository = __UPDATE_REPOSITORY__
  // 无更新源用演示；配置真实源时只有安装版可访问，开发环境标记不可用。
  const mode = !updateRepository ? 'demo' : app.isPackaged ? 'github' : 'unavailable'
  const backend = mode === 'github' ? (await import('./services/github-updater')).githubBackend(updateRepository, () => updater.installFailed()) : demoBackend(app.getVersion())
  const updater = new UpdateController(backend, { mode, currentVersion: app.getVersion(), repository: updateRepository || undefined, canInstall: process.platform !== 'darwin' || __MAC_SIGNED__ }, async () => {
    clearTimeout(boundsTimer)
    saveBounds()
    await shutdown()
    // 安装器会主动退出应用，此前已经完成停服和写入。
    closing = true
    quitting = true
  }, () => {
    // 安装器异步失败时恢复正常退出处理；仿真服务保持停止，可手动重启。
    closing = false
    quitting = false
    shutdownPromise = undefined
    simulator.resume()
    motion.resume()
  })
  registerUpdater(updater, () => window, expectedUrl)
  updateMenu(repository.get())
  createWindow()
  // 后台检查不阻塞窗口显示；只发现版本，不下载或安装。
  void updater.checkOnStartup()
  app.on('activate', () => { if (!window) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
// Cmd+Q 等应用级退出也要经过同一清理流程，不能只依赖窗口 close。
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  clearTimeout(boundsTimer)
  saveBounds()
  void shutdown().then(() => { quitting = true; closing = true; app.quit() })
})
