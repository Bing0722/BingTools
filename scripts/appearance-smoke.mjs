import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-appearance-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 3, language: 'en', theme: 'light', notificationPosition: 'bottom-right', sidebarWidth: 240, sidebarCollapsed: false }))
let app
const errors = [], remoteRequests = []
async function launch() {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ ...(process.env.BINGTOOLS_EXECUTABLE ? { executablePath: process.env.BINGTOOLS_EXECUTABLE, args: [`--user-data-dir=${directory}`] } : { args: [resolve('.')] }), env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()) })
  await page.getByRole('heading', { name: 'Server simulator', exact: true }).waitFor()
  return page
}
async function chooseMode(page, name, dark) {
  await page.getByRole('button', { name: 'Switch theme', exact: true }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
  await page.waitForFunction((dark) => document.documentElement.classList.contains('dark') === dark, dark)
}
try {
  await mkdir('test-results', { recursive: true })
  let page = await launch()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.color), 'graphite')
  const shortcut = await page.getByRole('button', { name: 'Switch theme', exact: true }).boundingBox()
  const settings = await page.getByRole('link', { name: 'Settings', exact: true }).boundingBox()
  assert.ok(shortcut.y < settings.y)
  await chooseMode(page, 'Dark', true)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'), 'true')
  for (const [color, name] of [['graphite', 'Graphite'], ['blue', 'Lake'], ['violet', 'Violet'], ['green', 'Forest'], ['amber', 'Amber'], ['rose', 'Rose']]) {
    await page.getByRole('button', { name, exact: true }).click()
    await page.waitForFunction((color) => document.documentElement.dataset.color === color, color)
    assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true')
  }
  await page.getByRole('button', { name: 'Violet', exact: true }).click()
  await page.getByLabel('Interface font', { exact: true }).selectOption('noto')
  await page.waitForFunction(() => getComputedStyle(document.body).fontFamily.includes('Noto Sans SC Variable'))
  await page.context().setOffline(true)
  assert.ok(await page.evaluate(async () => (await document.fonts.load('14px "Noto Sans SC Variable"', '中文ABC')).length > 0))
  // Verify actual rendered glyphs, not only the CSS family name.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  const document = await cdp.send('DOM.getDocument')
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '.font-preview p' })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  assert.ok(fonts.some((font) => font.isCustomFont && font.familyName.includes('Noto')))
  await cdp.detach()
  await page.locator('.appearance-section').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/appearance-violet-dark.png', animations: 'disabled' })
  await chooseMode(page, 'Light', false)
  await page.getByRole('button', { name: 'Forest', exact: true }).click()
  await page.screenshot({ path: 'test-results/appearance-forest-light.png', animations: 'disabled' })
  await page.getByLabel('Interface font', { exact: true }).selectOption('local')
  await page.getByLabel('Font name', { exact: true }).fill('Definitely Missing BingTools Font')
  await page.getByRole('button', { name: 'Apply font', exact: true }).click()
  await page.getByText('Local font not found.', { exact: false }).waitFor()
  assert.equal((await page.evaluate(() => window.app.settings.get())).data.preferences.uiFont, 'noto')
  await page.getByLabel('Font name', { exact: true }).fill('Arial')
  await page.getByRole('button', { name: 'Apply font', exact: true }).click()
  await page.waitForFunction(async () => (await window.app.settings.get()).data.preferences.uiFont === 'local')
  assert.ok(await page.evaluate(() => getComputedStyle(document.body).fontFamily.startsWith('Arial')))
  await page.getByLabel('Interface font', { exact: true }).selectOption('noto')
  await page.getByRole('button', { name: 'Switch theme', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).focus(); await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click()
  await page.getByRole('button', { name: 'Switch theme', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click()
  await page.getByRole('button', { name: 'Switch theme', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'System', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: 'Rose', exact: true }).click()
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 560))
  await page.locator('.appearance-section').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/appearance-narrow-zh.png', animations: 'disabled' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  assert.equal(await page.locator('.page-scroll').evaluate((element) => element.scrollWidth > element.clientWidth), false)
  await page.getByLabel('语言', { exact: true }).selectOption('en')
  await app.close(); app = undefined
  page = await launch()
  const prefs = (await page.evaluate(() => window.app.settings.get())).data.preferences
  assert.equal(prefs.themeColor, 'rose'); assert.equal(prefs.uiFont, 'noto'); assert.equal(prefs.theme, 'system')
  assert.equal(JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8')).schemaVersion, 4)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800))
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Reset appearance', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.color === 'graphite')
  const reset = (await page.evaluate(() => window.app.settings.get())).data.preferences
  assert.equal(reset.uiFont, 'system'); assert.equal(reset.language, 'en')
  assert.deepEqual(errors, []); assert.deepEqual(remoteRequests, [])
  console.log('PASS: v3 settings migration, six palettes, sidebar mouse/keyboard/collapsed shortcut, system mode, bundled Chinese glyph rendering offline, local font validation, persistence, reset and Chinese narrow layout. No remote font requests.')
} catch (error) { await app?.windows()[0]?.screenshot({ path: 'test-results/appearance-failure.png' }).catch(() => {}); throw error }
finally { if (app) await app.close(); await rm(directory, { recursive: true, force: true }) }
