import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-update-motion-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'en', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
let app, revision = 200
const errors = []
async function state(value) {
  await app.evaluate(({ BrowserWindow }, snapshot) => BrowserWindow.getAllWindows()[0].webContents.send('updater:event', snapshot), { revision: ++revision, mode: 'github', currentVersion: '0.8.4', repository: 'Bing0722/BingTools', canInstall: true, progress: 0, ...value })
}
try {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [resolve('.')], env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('.nav-selection.is-ready').waitFor()
  const marker = page.locator('.app-shell > .sidebar .nav-selection')
  const old = (await marker.boundingBox()).y
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.waitForFunction((old) => {
    const sidebar = document.querySelector('.app-shell > .sidebar')
    const current = sidebar.querySelector('.nav-selection').getBoundingClientRect().y
    const target = sidebar.querySelector('.nav-item.active').getBoundingClientRect().y
    return current > old + 1 && current < target - 1
  }, old)
  await page.waitForFunction(() => {
    const sidebar = document.querySelector('.app-shell > .sidebar')
    return Math.abs(sidebar.querySelector('.nav-selection').getBoundingClientRect().y - sidebar.querySelector('.nav-item.active').getBoundingClientRect().y) < 1
  })
  assert.equal(await page.locator('.page-scroll').evaluate((node) => getComputedStyle(node).opacity), '1')
  await state({ phase: 'available', version: '0.8.5', releaseNotes: 'A clearer workspace\nImproved downloads and navigation.' })
  await page.locator('.update-dot').waitFor()
  await page.locator('.update-trigger').click()
  const dialog = page.locator('.update-dialog')
  await dialog.getByText('0.8.5', { exact: true }).waitFor()
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/update-modern-light.png', animations: 'disabled' })
  // 注入可控状态，不下载文件、不运行安装器。
  await state({ phase: 'downloading', version: '0.8.5', progress: 42 })
  assert.equal(await dialog.getByRole('progressbar').getAttribute('value'), '42')
  await page.screenshot({ path: 'test-results/update-modern-download.png', animations: 'disabled' })
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
  await page.mouse.move(450, 80); await page.waitForTimeout(900)
  assert.equal(await page.getByRole('tooltip').count(), 0)
  assert.equal(await page.locator('.update-trigger').evaluate((node) => node === document.activeElement), true)
  assert.equal(await page.locator('.update-section progress').getAttribute('value'), '42')
  await state({ phase: 'error', version: '0.8.5', error: 'UPDATE_DOWNLOAD_FAILED' })
  await page.getByRole('button', { name: 'Retry download', exact: true }).waitFor()
  await state({ phase: 'downloaded', version: '0.8.5', progress: 100 })
  await page.locator('.update-trigger').click()
  await dialog.getByRole('button', { name: 'Restart and install', exact: true }).click()
  await page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Install update and restart?' }) }).waitFor()
  await page.keyboard.press('Escape'); await page.getByRole('heading', { name: 'Install update and restart?' }).waitFor({ state: 'hidden' }); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN')
  await state({ phase: 'available', version: '0.8.5', canInstall: false })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 560))
  await page.locator('.update-trigger').click()
  await dialog.getByRole('button', { name: '前往下载', exact: true }).waitFor()
  assert.equal(await dialog.getByRole('progressbar').count(), 0)
  assert.ok((await dialog.boundingBox()).height <= 560)
  await page.screenshot({ path: 'test-results/update-modern-dark-narrow.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await marker.evaluate((node) => getComputedStyle(node).transitionDuration), '0s')
  assert.equal(await page.locator('.page-container').evaluate((node) => getComputedStyle(node).animationName), 'none')
  assert.deepEqual(errors, [])
  console.log('PASS: navigation intermediate frames, opaque page, update dot, shared download progress, close focus without tooltip, retry/install confirmation/manual states and reduced motion.')
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }) }
