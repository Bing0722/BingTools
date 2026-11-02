import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-transfer-desktop-'))
const ep = { id: randomUUID(), name: 'Status', method: 'GET', path: '/status', status: 200, enabled: true, format: 'json', body: '{"ok":true}', responseDelay: { enabled: true, ms: 250 } }
const http = { id: randomUUID(), name: 'HTTP customer', host: '127.0.0.1', port: 48765, protocol: 'http', endpoints: [ep] }
const tcp = { ...http, id: randomUUID(), name: 'TCP customer', protocol: 'tcp', tcp: { delimiter: '3C54543E', extraction: 'json', field: 'action', separator: '|', index: 0, appendDelimiter: true, lengthHeader: { width: 5, prefix: '<HH', suffix: '>', radix: 'decimal', unit: 'bytes', scope: 'body', wrapResponse: true } } }
const serial = { path: '', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', rtscts: false, framing: 'delimiter', delimiter: '0A', frameLength: 8, idleMs: 50 }
const rule = { id: randomUUID(), name: 'Position', format: 'hex', receive: '504F53', response: '41', enabled: true, appendDelimiter: true, receiveSuffix: '0D', ignoreTailBytes: 1 }
const motion = { id: randomUUID(), name: 'Motion customer', serial, rules: [rule] }
await writeFile(join(directory, 'simulator.json'), JSON.stringify({ schemaVersion: 5, selectedCustomerId: http.id, customers: [http, tcp] }))
await writeFile(join(directory, 'motion.json'), JSON.stringify({ schemaVersion: 2, selectedCustomerId: motion.id, customers: [motion] }))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 3, language: 'en', theme: 'light', notificationPosition: 'bottom-right', sidebarWidth: 240, sidebarCollapsed: false }))
const errors = []
let app
async function launch() {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ ...(process.env.BINGTOOLS_EXECUTABLE ? { executablePath: process.env.BINGTOOLS_EXECUTABLE, args: [`--user-data-dir=${directory}`] } : { args: [resolve('.')] }), env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: 'Server simulator', exact: true }).waitFor()
  return page
}
async function chooseFile(file) {
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: !path, filePaths: path ? [path] : [] }) }, file)
}
async function saveFile(file) {
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: !path, filePath: path || undefined }) }, file)
}
async function snapshot(page, module = 'simulator') { return (await page.evaluate((module) => window.app[module].getSnapshot(), module)).data }
try {
  await mkdir('test-results', { recursive: true })
  let page = await launch()
  await page.getByRole('button', { name: 'Import / export', exact: true }).click()
  const file = join(directory, 'server-export.json')
  await saveFile(file)
  await page.getByLabel('Export scope', { exact: true }).selectOption('all')
  await page.getByRole('button', { name: 'Export to file', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Export complete.' }).waitFor()
  const data = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(data.customers.length, 2); assert.equal(data.customers[0].endpoints[0].responseDelay.ms, 250)
  assert.deepEqual(data.customers[1].tcp, tcp.tcp)
  assert.equal(data.logs, undefined)
  await chooseFile(file)
  await page.getByRole('button', { name: 'Choose import file', exact: true }).click()
  await page.getByText('File: 2 customers, 2 interfaces', { exact: false }).waitFor()
  await page.screenshot({ path: 'test-results/transfer-preview.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await page.getByText('Import complete.', { exact: true }).waitFor()
  assert.deepEqual((await snapshot(page)).config.customers.map((c) => c.name), ['HTTP customer', 'TCP customer', 'HTTP customer (2)', 'TCP customer (2)'])
  assert.equal((await snapshot(page)).runtime.phase, 'stopped')
  // Export one interface, reject duplicates atomically, then append to an empty customer.
  const interfaceFile = join(directory, 'interface.json')
  await saveFile(interfaceFile)
  await page.getByLabel('Export scope', { exact: true }).selectOption('interfaces')
  const current = (await snapshot(page)).config.customers[2]
  await page.getByLabel('Select interface', { exact: true }).selectOption(current.endpoints[0].id)
  await page.getByRole('button', { name: 'Export to file', exact: true }).click()
  await page.getByText('Export complete.', { exact: true }).waitFor()
  await chooseFile(interfaceFile)
  await page.getByRole('button', { name: 'Choose import file', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await page.locator('.toast.error').filter({ hasText: 'Conflicting interface' }).waitFor()
  assert.equal((await snapshot(page)).config.customers[2].endpoints.length, 1)
  await page.keyboard.press('Escape')
  const empty = { ...http, id: randomUUID(), name: 'Empty' }; delete empty.endpoints
  assert.equal((await page.evaluate((c) => window.app.simulator.saveCustomer(c), empty)).ok, true)
  await page.getByRole('button', { name: 'Import / export', exact: true }).click()
  await page.getByRole('button', { name: 'Choose import file', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await page.getByText('Import complete.', { exact: true }).waitFor()
  assert.deepEqual((await snapshot(page)).config.customers.at(-1).endpoints[0].responseDelay, ep.responseDelay)
  // Cancel and malformed/future files do not change data or leave an applicable preview.
  await chooseFile(null)
  await page.getByRole('button', { name: 'Choose import file', exact: true }).click()
  await page.waitForFunction(() => !document.body.textContent.includes('Processing…'))
  assert.equal(await page.getByRole('button', { name: 'Confirm import', exact: true }).count(), 0)
  const future = join(directory, 'future.json'); await writeFile(future, JSON.stringify({ ...data, version: 99 }))
  await chooseFile(future); await page.getByRole('button', { name: 'Choose import file', exact: true }).click()
  await page.locator('.toast.error').filter({ hasText: 'Unsupported export version' }).waitFor()
  assert.equal((await snapshot(page)).config.customers.length, 5)
  // IPC rejects path injection; choose/export paths are owned by native dialogs.
  assert.equal((await page.evaluate(() => window.app.transfer.export({ module: 'simulator', scope: 'customers', path: '/tmp/forbidden.json' }))).ok, false)
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Motion simulator', exact: true }).click()
  await page.getByRole('button', { name: 'Import / export', exact: true }).click()
  await chooseFile(file); await page.getByRole('button', { name: 'Choose import file', exact: true }).click()
  await page.locator('.toast.error').filter({ hasText: 'another simulator module' }).waitFor()
  const serialFile = join(directory, 'serial.json'); await saveFile(serialFile)
  await page.getByRole('button', { name: 'Export to file', exact: true }).click()
  await page.getByText('Export complete.', { exact: true }).waitFor()
  assert.deepEqual(JSON.parse(await readFile(serialFile, 'utf8')).customers[0].rules[0], rule)
  await chooseFile(serialFile); await page.getByRole('button', { name: 'Choose import file', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm import', exact: true }).click()
  await page.getByText('Import complete.', { exact: true }).waitFor()
  assert.equal((await snapshot(page, 'motion')).config.customers[1].name, 'Motion customer (2)')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 560))
  await page.evaluate(() => window.app.settings.update({ language: 'zh-CN', theme: 'dark' }))
  await page.reload()
  await page.getByRole('button', { name: '导入 / 导出', exact: true }).click()
  await page.getByRole('button', { name: '选择导入文件', exact: true }).waitFor()
  await page.getByRole('button', { name: '选择导入文件', exact: true }).click()
  await page.getByRole('button', { name: '确认导入', exact: true }).waitFor()
  await page.getByRole('button', { name: '确认导入', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/transfer-narrow-dark-zh.png', animations: 'disabled' })
  const box = await page.getByRole('dialog').boundingBox()
  const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1)
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.app.settings.update({ language: 'en' }))
  await app.close(); app = undefined
  page = await launch()
  assert.equal((await snapshot(page)).config.customers.length, 5)
  assert.equal((await snapshot(page, 'motion')).config.customers.length, 2)
  assert.deepEqual(errors, [])
  console.log('PASS: HTTP/TCP/serial customer and interface migration, worker file IO, preview/confirmation, duplicate protection, cancellation, version/module rejection, path injection rejection, narrow dark Chinese UI and restart persistence. Native dialog selections stubbed; no hardware used.')
} catch (error) {
  await app?.windows()[0]?.screenshot({ path: 'test-results/transfer-failure.png' }).catch(() => {})
  throw error
} finally { if (app) await app.close(); await rm(directory, { recursive: true, force: true }) }
