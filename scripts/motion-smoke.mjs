import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-motion-ui-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'zh-CN', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
let application
try {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ ...(process.env.BINGTOOLS_EXECUTABLE ? { executablePath: process.env.BINGTOOLS_EXECUTABLE, args: [`--user-data-dir=${directory}`] } : { args: [resolve('.')] }), env })
  const page = await application.firstWindow(), errors = []
  page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('link', { name: '运控仿真', exact: true }).click()
  await page.getByRole('heading', { name: '运控仿真', exact: true }).waitFor()
  // 日志收起须贴住窗口底部，接口区域自动填补释放的高度。
  const checkCollapse = async () => {
    await page.getByRole('button', { name: '收起日志', exact: true }).click()
    await page.waitForFunction(() => Math.abs(document.querySelector('.log-panel').getBoundingClientRect().height - 43) < 1)
    assert.equal(await page.locator('.log-panel').evaluate((v) => Math.abs(v.getBoundingClientRect().bottom - innerHeight) < 1), true)
    assert.equal(await page.locator('.endpoint-board').evaluate((v) => Math.abs(v.getBoundingClientRect().bottom - document.querySelector('.log-panel').getBoundingClientRect().top) < 1), true)
    await page.getByRole('button', { name: '展开日志', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.log-panel').getBoundingClientRect().height > 80)
  }
  await checkCollapse()
  const ports = await page.evaluate(() => window.app.motion.listPorts())
  assert.equal(ports.ok, true)
  await page.getByRole('button', { name: '新增客户', exact: true }).click()
  await page.getByLabel('客户名称', { exact: true }).fill('运控测试')
  await page.getByLabel('波特率', { exact: true }).fill('115200')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  for (const [name, receive, response] of [['位置查询','POS?','100'], ['回零','HOME','OK']]) {
    await page.getByRole('button', { name: '新增接口', exact: true }).click()
    await page.getByLabel('接口名称', { exact: true }).fill(name)
    await page.getByLabel('收到的内容', { exact: true }).fill(receive)
    await page.getByLabel('回复 / 手动发送内容', { exact: true }).fill(response)
    await page.getByLabel('匹配前移除尾符（HEX，可留空）', { exact: true }).fill('0D')
    await page.getByLabel('随后忽略末尾字节数', { exact: true }).fill('1')
    await page.getByRole('button', { name: '保存接口', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  assert.equal(await page.locator('.endpoint-card').count(), 2)
  assert.equal(await page.getByRole('button', { name: '发送', exact: true }).first().isDisabled(), true)
  await page.getByRole('switch').first().click()
  await page.waitForFunction(() => document.querySelector('[role="switch"]').getAttribute('aria-checked') === 'true')
  await page.getByRole('button', { name: '移动接口 位置查询', exact: true }).dragTo(page.locator('.endpoint-card').last())
  await page.waitForFunction(() => document.querySelector('.endpoint-card-open strong').textContent === '回零')
  await page.getByRole('button', { name: '编辑接口 位置查询', exact: true }).click()
  await page.getByLabel('内容格式', { exact: true }).selectOption('hex')
  await page.getByRole('button', { name: '保存接口', exact: true }).click()
  await page.locator('.toast.error').waitFor()
  assert.equal(await page.getByLabel('收到的内容', { exact: true }).inputValue(), 'POS?')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.locator('.motion-dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '连接', exact: true }).click()
  await page.locator('.toast.error').filter({ hasText: '串口不存在' }).waitFor()
  await mkdir('test-results', { recursive: true })
  while (await page.getByRole('button', { name: '关闭通知', exact: true }).count()) await page.getByRole('button', { name: '关闭通知', exact: true }).first().click()
  await page.screenshot({ path: 'test-results/motion-cards.png', animations: 'disabled' })
  await page.getByRole('button', { name: '编辑客户', exact: true }).click()
  await page.screenshot({ path: 'test-results/motion-serial-settings.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await page.locator('.motion-dialog').waitFor({ state: 'hidden' })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800,560))
  await checkCollapse()
  await page.screenshot({ path: 'test-results/motion-narrow.png', animations: 'disabled' })
  assert.equal(await page.locator('.log-panel').evaluate((v) => v.getBoundingClientRect().bottom <= innerHeight + 1), true)
  const snapshot = await page.evaluate(() => window.app.motion.getSnapshot())
  assert.equal(snapshot.data.config.customers[0].serial.baudRate, 115200)
  assert.equal(snapshot.data.config.customers[0].rules[0].receiveSuffix, '0D')
  assert.equal(snapshot.data.config.customers[0].rules[0].ignoreTailBytes, 1)
  assert.equal(snapshot.data.config.customers[0].rules[0].name, '回零')
  await application.close(); application = undefined
  application = await electron.launch({ ...(process.env.BINGTOOLS_EXECUTABLE ? { executablePath: process.env.BINGTOOLS_EXECUTABLE, args: [`--user-data-dir=${directory}`] } : { args: [resolve('.')] }), env })
  const reopened = await application.firstWindow()
  await reopened.getByRole('link', { name: '运控仿真', exact: true }).click()
  await reopened.getByRole('heading', { name: '运控仿真', exact: true }).waitFor()
  const restored = await reopened.evaluate(() => window.app.motion.getSnapshot())
  assert.equal(restored.data.phase, 'stopped')
  assert.deepEqual(restored.data.config, snapshot.data.config)
  assert.deepEqual(errors, [])
  console.log('PASS: native serial enumeration; motion customer/rules, toggle, drag, validation, unsaved guard and narrow layout. No hardware connected.')
} catch (error) {
  const page = application?.windows()[0]
  if (page) { console.error((await page.locator('body').innerText()).slice(-3500)); await page.screenshot({ path: 'test-results/motion-failure.png' }) }
  throw error
} finally { if (application) await application.close(); await rm(directory, { recursive: true, force: true }) }
