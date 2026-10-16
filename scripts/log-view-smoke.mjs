import { _electron as electron } from 'playwright'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-log-view-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'zh-CN', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
let application
try {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ args: [resolve('.')], env })
  const page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  const navigate = async (name) => {
    await page.getByRole('link', { name, exact: true }).click()
    await page.getByRole('heading', { name, exact: true }).waitFor()
  }
  const toggle = (name) => page.getByRole('button', { name, exact: true }).click()
  await page.getByLabel('搜索日志', { exact: true }).fill('http-filter')
  await page.getByLabel('日志级别', { exact: true }).selectOption('warn')
  await toggle('暂停滚动')
  await toggle('收起日志')
  await navigate('运控仿真')
  assert.equal(await page.locator('.log-heading').getAttribute('aria-expanded'), 'true')
  assert.equal(await page.getByLabel('搜索日志', { exact: true }).inputValue(), '')
  await page.getByLabel('搜索日志', { exact: true }).fill('serial-filter')
  await page.getByLabel('收发方向', { exact: true }).selectOption('rx')
  await toggle('暂停滚动')
  await toggle('收起日志')
  await navigate('设置')
  for (const [name, query, label, value] of [['服务器仿真', 'http-filter', '日志级别', 'warn'], ['运控仿真', 'serial-filter', '收发方向', 'rx']]) {
    await navigate(name)
    assert.equal(await page.locator('.log-heading').getAttribute('aria-expanded'), 'false')
    await page.waitForFunction(() => Math.abs(document.querySelector('.log-panel').getBoundingClientRect().height - 43) < 1)
    await toggle('展开日志')
    assert.equal(await page.getByLabel('搜索日志', { exact: true }).inputValue(), query)
    assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), value)
    assert.equal(await page.getByRole('button', { name: '自动滚动', exact: true }).getAttribute('aria-pressed'), 'true')
    await navigate('设置')
    await navigate(name)
    assert.equal(await page.locator('.log-heading').getAttribute('aria-expanded'), 'true')
  }
  // 用模拟串口日志验证虚拟列表在暂停时恢复浏览位置，不连接硬件。
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('motion:event', {
    type: 'logs', entries: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, time: Date.now(), customerId: null, direction: 'rx', code: 'MOTION_RECEIVED', level: 'info', text: `serial-filter ${i}`, hex: '', bytes: 1, truncated: false })),
  }))
  await page.waitForFunction(() => document.querySelector('.motion-log-list').scrollHeight > 1000)
  await page.locator('.motion-log-list').evaluate((element) => { element.scrollTop = 640 })
  await navigate('设置')
  await navigate('运控仿真')
  await page.waitForFunction(() => document.querySelector('.motion-log-list').scrollTop === 640)
  // 重启 renderer 会话后恢复默认，视图状态不写入正式设置。
  await page.reload()
  await page.getByRole('button', { name: '暂停滚动', exact: true }).waitFor()
  assert.equal(await page.getByLabel('搜索日志', { exact: true }).inputValue(), '')
  console.log('Log views: independent collapse, filters, pause, expanded state and session reset passed')
} finally {
  await application?.close()
  await rm(directory, { recursive: true, force: true })
}
