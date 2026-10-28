import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createServer, connect } from 'node:net'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-tcp-ui-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'zh-CN', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
const probe = createServer()
await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve))
const port = probe.address().port
await new Promise((resolve) => probe.close(resolve))
let application, client
try {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ args: [resolve('.')], env })
  const page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  const errors = []; page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: '新增客户', exact: true }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('连接方式', { exact: true }).selectOption('tcp')
  await dialog.getByLabel('客户名称', { exact: true }).fill('TCP 测试')
  await dialog.getByLabel('端口', { exact: true }).fill(String(port))
  await dialog.getByLabel('接口字段路径（如 action 或 data.command）').fill('data.action')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '新增接口', exact: true }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('接口名称', { exact: true }).fill('getStatus')
  await dialog.getByLabel('响应内容', { exact: true }).fill('{\n  "ok": true\n}')
  assert.equal(await dialog.getByLabel('HTTP 方法', { exact: true }).count(), 0)
  await dialog.getByRole('switch').click()
  await dialog.getByRole('button', { name: '保存接口', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '启动服务', exact: true }).click()
  await page.locator('.runtime-badge.phase-running').waitFor()
  client = connect(port, '127.0.0.1')
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('error', reject) })
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('TCP response timed out')), 3000)
    client.once('data', (data) => { clearTimeout(timer); resolve(data.toString()) })
  })
  client.write('{"data":{"action":"getStatus"}}\n')
  assert.equal(await result, '{"ok":true}\n')
  await page.locator('.log-entry').filter({ hasText: 'getStatus' }).waitFor()
  await page.locator('.endpoint-card').getByRole('switch').click()
  client.write('{"data":{"action":"getStatus"}}\n')
  await page.waitForFunction(() => document.querySelectorAll('.log-entry.level-warn').length > 0)
  await page.getByRole('button', { name: '停止服务', exact: true }).click()
  await page.locator('.runtime-badge.phase-stopped').waitFor()
  await page.getByRole('button', { name: '编辑客户', exact: true }).click()
  await dialog.getByLabel('字段提取格式').selectOption('text')
  await dialog.getByLabel('文本字段分隔符（空白表示整帧）').fill('|')
  await dialog.getByLabel('字段序号（从 0 开始）').fill('1')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 650))
  await mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/tcp-settings.png' })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  const snapshot = await page.evaluate(() => window.app.simulator.getSnapshot())
  assert.equal(snapshot.data.config.customers[0].tcp.separator, '|')
  assert.equal(snapshot.data.config.schemaVersion, 2)
  assert.deepEqual(errors, [])
  console.log('TCP desktop: customer configuration, JSON interface, real response, toggle, logs, stop and narrow text settings passed')
} finally {
  client?.destroy()
  await application?.close()
  await rm(directory, { recursive: true, force: true })
}
