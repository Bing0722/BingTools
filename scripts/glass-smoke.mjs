import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-glass-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 4, language: 'en', theme: 'light', notificationPosition: 'bottom-right', sidebarWidth: 240, sidebarCollapsed: false, themeColor: 'blue', uiFont: 'system', localFont: 'Arial' }))
let app
const errors = []
async function launch() {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [resolve('.')], env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Liquid glass', exact: true }).waitFor()
  return page
}
const settle = (page) => page.waitForFunction(() => !document.querySelector('.glass-settings button[role="switch"]').disabled)
try {
  await mkdir('test-results', { recursive: true })
  let page = await launch()
  assert.equal(await page.locator('html').getAttribute('data-glass'), 'false')
  const toggle = page.getByRole('switch', { name: 'Liquid glass', exact: true })
  await toggle.focus(); await page.keyboard.press('Space')
  await page.waitForFunction(() => document.documentElement.dataset.glass === 'true')
  await settle(page)
  const range = page.getByRole('slider', { name: 'Glass intensity' })
  await range.focus(); await page.keyboard.press('End')
  assert.equal(await range.inputValue(), '100')
  assert.equal((await page.evaluate(() => window.app.settings.get())).data.preferences.glassIntensity, 55)
  await page.getByRole('button', { name: 'Apply effect', exact: true }).click(); await settle(page)
  assert.match(await page.locator('.app-shell > .sidebar').evaluate((node) => getComputedStyle(node).backdropFilter), /blur\(26px\)/)
  await page.locator('.glass-settings').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/glass-light.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Dark', exact: true }).click(); await settle(page)
  await page.locator('.glass-settings').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/glass-dark.png', animations: 'disabled' })
  await range.focus(); await page.keyboard.press('Home'); await page.getByRole('button', { name: 'Apply effect', exact: true }).click(); await settle(page)
  assert.equal((await page.evaluate(() => window.app.settings.get())).data.preferences.glassIntensity, 1)
  await toggle.click(); await settle(page)
  assert.equal(await range.isDisabled(), true)
  assert.equal(await page.locator('.app-shell > .sidebar').evaluate((node) => getComputedStyle(node).backdropFilter), 'none')
  await toggle.click(); await settle(page)
  await app.close(); page = await launch()
  assert.equal(await page.getByRole('slider', { name: 'Glass intensity' }).inputValue(), '1')
  assert.equal(await page.getByRole('switch', { name: 'Liquid glass' }).getAttribute('aria-checked'), 'true')
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN'); await settle(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 560))
  await page.locator('.glass-settings').scrollIntoViewIfNeeded()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: 'test-results/glass-narrow.png', animations: 'disabled' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.glass-demo-card').evaluate((node) => getComputedStyle(node).transitionDuration), '0s')
  await page.getByRole('button', { name: '恢复默认外观', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.glass === 'false')
  assert.equal((await page.evaluate(() => window.app.settings.get())).data.preferences.glassIntensity, 55)
  assert.deepEqual(errors, [])
  console.log('PASS: v4 migration, glass toggle, preview/apply, intensity boundaries, blur, dark/light, persistence, disable/reset, reduced motion and narrow layout.')
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }) }
