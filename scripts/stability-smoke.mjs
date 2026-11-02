import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-stability-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 4, language: 'en', theme: 'light', notificationPosition: 'bottom-right', sidebarWidth: 240, sidebarCollapsed: false, themeColor: 'blue', uiFont: 'system', localFont: 'Arial' }))
const server = createServer()
await new Promise((done) => server.listen(0, '127.0.0.1', done)); const port = server.address().port
await new Promise((done) => server.close(done))
const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
let app
const errors = []
try {
  app = await electron.launch({ args: [resolve('.')], env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Liquid glass' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.glass === 'true')
  await page.evaluate(() => {
    window.disabledAppearance = false
    const nodes = [...document.querySelectorAll('.theme-choice,.color-choice')]
    window.appearanceObserver = new MutationObserver(() => { if (nodes.some((node) => node.disabled)) window.disabledAppearance = true })
    nodes.forEach((node) => window.appearanceObserver.observe(node, { attributes: true, attributeFilter: ['disabled'] }))
  })
  const toggle = page.getByRole('button', { name: 'Toggle sidebar', exact: true })
  await toggle.click(); await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().width === 56)
  await toggle.click(); await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().width === 240)
  assert.equal(await page.evaluate(() => window.disabledAppearance), false)
  assert.equal(await page.locator('.page-scroll').evaluate((node) => getComputedStyle(node).animationName), 'none')
  await page.getByRole('link', { name: 'Server simulator', exact: true }).hover()
  await page.waitForTimeout(800)
  assert.equal(await page.getByRole('tooltip').count(), 0)
  await toggle.click(); await page.waitForFunction(() => document.querySelector('.sidebar').getBoundingClientRect().width === 56)
  const nav = page.getByRole('link', { name: 'Server simulator', exact: true })
  await nav.hover(); await page.getByRole('tooltip').waitFor()
  const bounds = await page.locator('.tooltip').boundingBox(), target = await nav.boundingBox()
  assert.ok(bounds.x >= target.x + target.width)
  await page.keyboard.press('Escape'); await nav.click()
  await page.getByRole('button', { name: 'Add customer', exact: true }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('Customer name', { exact: true }).fill('Stable layout')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click(); await dialog.waitFor({ state: 'hidden' })
  const topBefore = await page.locator('.simulator-top').boundingBox()
  const portInput = page.locator('.server-controls').getByRole('spinbutton', { name: 'Port', exact: true })
  await portInput.fill(String(port))
  assert.equal(await page.locator('.server-controls').getByRole('button', { name: 'Save', exact: true }).count(), 0)
  // 直接点击启动，必须先保存本次端口，无需第二次点击或确认弹窗。
  await page.getByRole('button', { name: 'Start server', exact: true }).click()
  await page.locator('.runtime-badge').filter({ hasText: 'Running' }).waitFor()
  const snapshot = await page.evaluate(() => window.app.simulator.getSnapshot())
  assert.equal(snapshot.data.config.customers[0].port, port)
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 404)
  assert.equal((await page.locator('.simulator-top').boundingBox()).height, topBefore.height)
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/stable-running.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Stop server', exact: true }).click()
  await page.locator('.runtime-badge').filter({ hasText: 'Stopped' }).waitFor()
  // 保存失败必须保留输入与磁盘原值；修正后可以直接切换路由。
  await mkdir(join(directory, 'simulator.json.tmp'))
  await portInput.fill('43210'); await portInput.press('Enter')
  await page.locator('.toast.error').first().waitFor()
  assert.equal(await portInput.inputValue(), '43210')
  assert.equal((await page.evaluate(() => window.app.simulator.getSnapshot())).data.config.customers[0].port, port)
  await rm(join(directory, 'simulator.json.tmp'), { recursive: true })
  await portInput.fill('43211')
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal((await page.evaluate(() => window.app.simulator.getSnapshot())).data.config.customers[0].port, 43211)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 560))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  console.log('PASS: no appearance disable flash, stable route/toolbar, tooltip placement, port autosave before real HTTP start, failure retention and navigation flush.')
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }) }
