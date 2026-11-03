import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-ai-import-'))
const http = { id: randomUUID(), name: 'Private HTTP customer', protocol: 'http', host: '127.0.0.1', port: 47891, endpoints: [] }
const tcp = { ...http, id: randomUUID(), name: 'Private TCP customer', protocol: 'tcp', tcp: { delimiter: '0A', extraction: 'json', field: 'action', separator: '', index: 0, appendDelimiter: true } }
const motion = { id: randomUUID(), name: 'Private serial customer', serial: { path: '', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', rtscts: false, framing: 'delimiter', delimiter: '0A', frameLength: 8, idleMs: 50 }, rules: [] }
await writeFile(join(directory, 'simulator.json'), JSON.stringify({ schemaVersion: 5, selectedCustomerId: http.id, customers: [http, tcp] }))
await writeFile(join(directory, 'motion.json'), JSON.stringify({ schemaVersion: 2, selectedCustomerId: motion.id, customers: [motion] }))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'en', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
let app
const errors = [], requests = []
try {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [resolve('.')], env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()) })
  await page.getByRole('heading', { name: 'Server simulator', exact: true }).waitFor()
  for (const protocol of ['http', 'tcp', 'motion']) {
    if (protocol === 'tcp') await page.getByLabel('Customer', { exact: true }).selectOption(tcp.id)
    if (protocol === 'motion') await page.getByRole('link', { name: 'Motion simulator', exact: true }).click()
    await page.getByRole('button', { name: 'Import / export', exact: true }).click()
    const dialog = page.getByRole('dialog')
    if (protocol !== 'motion') assert.equal(await dialog.getByLabel('Interface type', { exact: true }).inputValue(), protocol)
    await dialog.getByRole('button', { name: 'Copy rules for AI', exact: true }).click()
    await dialog.getByRole('button', { name: 'Rules copied', exact: true }).waitFor()
    const prompt = await app.evaluate(({ clipboard }) => clipboard.readText())
    assert.ok(!prompt.includes('Private'))
    const example = JSON.parse(prompt.split('```json')[1].split('```')[0])
    assert.equal(example.module, protocol === 'motion' ? 'motion' : 'simulator')
    await dialog.getByText('View full instructions', { exact: true }).click()
    assert.equal(await dialog.getByLabel('AI instructions', { exact: true }).inputValue(), prompt)
    const path = join(directory, `${protocol}.json`); await writeFile(path, JSON.stringify(example))
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, path)
    await dialog.getByRole('button', { name: 'Choose import file', exact: true }).click()
    await dialog.getByRole('button', { name: 'Confirm import', exact: true }).click()
    await dialog.getByText('Import complete.', { exact: false }).waitFor()
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' })
  }
  const simulator = (await page.evaluate(() => window.app.simulator.getSnapshot())).data
  assert.equal(simulator.config.customers[0].endpoints.length, 1)
  assert.equal(simulator.config.customers[1].endpoints.length, 1)
  assert.equal((await page.evaluate(() => window.app.motion.getSnapshot())).data.config.customers[0].rules.length, 1)
  assert.equal((await page.evaluate(() => window.app.transfer.copyAiPrompt({ protocol: 'http', language: 'en', text: 'uncontrolled' }))).ok, false)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Dark', exact: true }).click()
  await page.getByLabel('Language', { exact: true }).selectOption('zh-CN')
  await page.getByRole('link', { name: '运控仿真', exact: true }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 560))
  await page.getByRole('button', { name: '导入 / 导出', exact: true }).click()
  await page.getByRole('button', { name: '复制规则给 AI', exact: true }).click()
  assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /运控串口/)
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/ai-import-narrow.png', animations: 'disabled' })
  await app.evaluate(({ clipboard }) => { clipboard.writeText = () => { throw new Error('test failure') } })
  await page.getByRole('button', { name: '已复制规则', exact: true }).click()
  await page.getByText('复制失败，请展开提示词后手动全选复制。', { exact: true }).waitFor()
  assert.deepEqual(errors, []); assert.deepEqual(requests, [])
  console.log('PASS: protocol defaults, real clipboard, privacy, all three examples imported through worker, invalid IPC, Chinese dark narrow UI and copy failure fallback; no network requests.')
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }) }
