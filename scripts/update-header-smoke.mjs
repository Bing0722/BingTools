import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-update-ui-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'zh-CN', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
let application
try {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ args: [resolve('.')], env })
  const page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  await page.locator('.update-trigger').waitFor()
  // 真实 Electron 界面，使用模拟更新 IPC；不访问 GitHub 或下载文件。
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    ipcMain.removeHandler('updater:check')
    let revision = 100
    ipcMain.handle('updater:check', async () => {
      revision += 10
      const state = { revision, mode: 'demo', currentVersion: '0.4.4', phase: 'checking', progress: 0 }
      BrowserWindow.getAllWindows()[0].webContents.send('updater:event', state)
      await new Promise((resolve) => setTimeout(resolve, 300))
      const available = { ...state, revision: revision + 1, phase: 'available', version: '0.4.5', releaseNotes: '模拟更新说明' }
      BrowserWindow.getAllWindows()[0].webContents.send('updater:event', available)
      return { ok: true, data: available }
    })
    BrowserWindow.getAllWindows()[0].webContents.send('updater:event', { revision: 99, mode: 'demo', currentVersion: '0.4.4', phase: 'idle', progress: 0 })
  })
  await page.getByRole('button', { name: '演示检查更新', exact: true }).click()
  await page.locator('.update-checking-icon').waitFor()
  await page.locator('.update-dot').waitFor()
  await page.getByRole('dialog').getByText('模拟更新说明', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.update-trigger').evaluate((el) => el === document.activeElement), true)
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByText('新版本 0.4.5', { exact: true }).waitFor()
  assert.equal(await page.locator('.update-dot').count(), 1)
  // 旧快照不能清掉已知更新；最新的“无更新”状态应清除红点。
  for (const revision of [98, 112]) {
    await application.evaluate(({ BrowserWindow }, revision) => BrowserWindow.getAllWindows()[0].webContents.send('updater:event', { revision, mode: 'demo', currentVersion: '0.4.4', phase: 'current', progress: 0 }), revision)
    if (revision === 98) assert.equal(await page.locator('.update-dot').count(), 1)
    else await page.locator('.update-dot').waitFor({ state: 'detached' })
  }
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await page.getByLabel('语言', { exact: true }).selectOption('en')
  await page.locator('.page-header').getByRole('button', { name: 'Demo: check for updates', exact: true }).waitFor()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 650))
  await page.locator('.update-trigger').click()
  await page.locator('.update-dot').waitFor()
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/update-header.png' })
  console.log('Update header: checking, dot, shared state, stale snapshot, keyboard, language and narrow window passed')
} finally {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
}
