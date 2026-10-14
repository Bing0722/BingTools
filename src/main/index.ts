import { app, BrowserWindow, nativeTheme, screen, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SettingsRepository } from './storage/settings-repository'
import { registerSettings } from './ipc/settings'
import { SimulatorRepository } from './storage/simulator-repository'
import { SimulatorController } from './services/simulator-controller'
import { registerSimulator } from './ipc/simulator'
import { updateMenu } from './menu'

app.setName('BingTools')
// 测试使用独立数据目录，不读取或改写用户正式设置。
if (!app.isPackaged && process.env.BINGTOOLS_TEST_DATA) app.setPath('userData', process.env.BINGTOOLS_TEST_DATA)
let window: BrowserWindow | null = null
let quitting = false
let closing = false
let boundsTimer: ReturnType<typeof setTimeout> | undefined
const repository = new SettingsRepository(join(app.getPath('userData'), 'settings.json'))
const simulatorRepository = new SimulatorRepository(join(app.getPath('userData'), 'simulator.json'))
const simulator = new SimulatorController(simulatorRepository)
let shutdownPromise: Promise<void> | undefined
function shutdown(): Promise<void> {
  // 窗口关闭与应用退出可能重入，复用同一个释放过程。
  return shutdownPromise ??= Promise.all([repository.flush(), simulator.shutdown()]).then(() => undefined)
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

function createWindow(): void {
  closing = false
  shutdownPromise = undefined
  simulator.resume()
  const settings = repository.get()
  nativeTheme.themeSource = settings.theme
  const workArea = screen.getPrimaryDisplay().workArea
  const saved = settings.windowBounds
  const visible = saved && screen.getAllDisplays().some(({ workArea: area }) =>
    saved.x >= area.x && saved.y >= area.y && saved.x + saved.width <= area.x + area.width &&
    saved.y + saved.height <= area.y + area.height)
  window = new BrowserWindow({
    width: Math.min(1200, workArea.width), height: Math.min(800, workArea.height),
    ...(visible ? saved : {}),
    minWidth: Math.min(800, workArea.width), minHeight: Math.min(560, workArea.height),
    show: false,
    title: 'BingTools',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 } } : {}),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#18181B' : '#FFFFFF',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.on('resize', queueBounds)
  window.on('move', queueBounds)
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
function queueBounds(): void {
  clearTimeout(boundsTimer)
  boundsTimer = setTimeout(saveBounds, 300)
}

void app.whenReady().then(async () => {
  await Promise.all([repository.load(), simulatorRepository.load()])
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = devUrl
      ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; object-src 'none'; base-uri 'none'; frame-src 'none'"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'"
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } })
  })
  registerSettings(repository, () => window, expectedUrl, updateMenu)
  registerSimulator(simulator, () => window, expectedUrl)
  updateMenu(repository.get())
  createWindow()
  app.on('activate', () => { if (!window) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  clearTimeout(boundsTimer)
  saveBounds()
  void shutdown().then(() => { quitting = true; closing = true; app.quit() })
})
