import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

// 全流程使用独立配置目录和临时监听端口，不接触正式客户数据。
const directory = await mkdtemp(join(tmpdir(), 'bingtools-desktop-'))
const errors = []
let application
const executablePath = process.env.BINGTOOLS_EXECUTABLE
const reserved = createServer()
await new Promise((resolve, reject) => { reserved.once('error', reject); reserved.listen(0, '127.0.0.1', resolve) })
const port = reserved.address().port
await new Promise((resolve) => reserved.close(resolve))
const url = `http://127.0.0.1:${port}/api/example`
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'zh-CN', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
async function launch(language = 'zh-CN') {
  const environment = { ...process.env, BINGTOOLS_TEST_DATA: directory }
  delete environment.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    ...(executablePath ? { executablePath, args: [`--user-data-dir=${directory}`] } : { args: [resolve('.')] }),
    env: environment,
  })
  const page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: language === 'en' ? 'Server simulator' : '服务器仿真', exact: true }).waitFor()
  return page
}
async function waitTheme(page, theme) {
  await page.waitForFunction((dark) => document.documentElement.classList.contains('dark') === dark, theme === 'dark')
}
async function screenshot(page, name) {
  const dismiss = page.getByRole('button', { name: /^(Dismiss notification|关闭通知)$/ })
  while (await dismiss.count()) await dismiss.first().click()
  // 等待有限过渡结束，截图不能停在卡片位移/弹窗淡入的中间帧。
  await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {}))))
  await page.screenshot({ path: `test-results/${name}.png` })
}
async function goSettings(page) {
  if (await page.evaluate(() => window.innerWidth < 960)) await page.getByRole('button', { name: /切换侧栏|Toggle sidebar/ }).click()
  await page.getByRole('link', { name: /^(设置|Settings)$/ }).click()
}
try {
  await mkdir('test-results', { recursive: true })
  let page = await launch()
  assert.equal(await page.getByLabel('客户', { exact: true }).locator('option').allTextContents().then((items) => items.join()), '—')
  // 标题栏不随侧栏移动；动画必须经历中间宽度，收起后仍可键盘展开。
  const headerBefore = await page.locator('.page-header').boundingBox()
  await page.getByRole('button', { name: '切换侧栏', exact: true }).click()
  await page.waitForFunction(() => {
    const width = document.querySelector('.app-shell > .sidebar').getBoundingClientRect().width
    return width > 56 && width < 240
  })
  await page.waitForFunction(() => Math.abs(document.querySelector('.app-shell > .sidebar').getBoundingClientRect().width - 56) < 1)
  assert.deepEqual(await page.locator('.page-header').boundingBox(), headerBefore)
  if (process.platform === 'darwin') {
    assert.ok((await page.getByRole('button', { name: '切换侧栏', exact: true }).boundingBox()).x >= 96)
  } else if (process.platform === 'win32') {
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), false)
  }
  await screenshot(page, 'shell-collapsed')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+b' : 'Control+b')
  await page.waitForFunction(() => Math.abs(document.querySelector('.app-shell > .sidebar').getBoundingClientRect().width - 240) < 1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await page.locator('.app-shell').evaluate((element) => getComputedStyle(element).transitionDuration), '0s')
  assert.equal(await page.locator('.page-scroll').evaluate((element) => getComputedStyle(element).animationName), 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await screenshot(page, 'shell-expanded')
  await page.getByRole('button', { name: '新增客户', exact: true }).first().click()
  let dialog = page.getByRole('dialog')
  await dialog.getByLabel('客户名称', { exact: true }).fill('集成验证客户')
  await dialog.getByLabel('端口', { exact: true }).fill(String(port))
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '新增接口', exact: true }).first().click()
  await page.getByLabel('接口名称', { exact: true }).fill('健康检查')
  await page.getByLabel('响应内容', { exact: true }).fill('{"ok":true}')
  await page.getByRole('button', { name: '美化 JSON', exact: true }).click()
  assert.equal(await page.getByLabel('响应内容', { exact: true }).inputValue(), '{\n  "ok": true\n}')
  await page.getByText('JSON 格式正确', { exact: true }).waitFor()
  await page.locator('#json-validation').scrollIntoViewIfNeeded()
  assert.equal(await page.locator('.body-field').evaluate((element) => element.getBoundingClientRect().bottom <= element.nextElementSibling.getBoundingClientRect().top), true)
  await screenshot(page, 'json-formatted')
  await page.getByRole('switch', { name: '启用', exact: true }).click()
  await page.getByRole('button', { name: '保存接口', exact: true }).click()
  await page.locator('.endpoint-dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '启动服务', exact: true }).click()
  await page.locator('.runtime-badge').filter({ hasText: '运行中' }).waitFor()
  assert.deepEqual(await (await fetch(url + '?query=ignored', { headers: { Authorization: 'secret', Cookie: 'token=secret' } })).json(), { ok: true })
  await page.locator('.log-entry').filter({ hasText: '/api/example' }).first().click()
  dialog = page.getByRole('dialog')
  assert.match(await dialog.innerText(), /REDACTED/)
  assert.doesNotMatch(await dialog.innerText(), /secret/)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('监听 IP', { exact: true }).isDisabled(), true)
  await page.evaluate(() => {
    window.toggleFlashes = []
    window.toggleObserver = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === 'disabled' && record.target.matches('.endpoint-card button'))) window.toggleFlashes.push('disabled')
    })
    window.toggleObserver.observe(document.querySelector('.endpoint-grid'), { attributes: true, subtree: true })
  })
  await page.getByRole('switch', { name: '启用接口 健康检查', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.endpoint-card [role="switch"]')?.getAttribute('aria-checked') === 'false')
  assert.equal((await fetch(url)).status, 404)
  assert.deepEqual(await page.evaluate(() => { window.toggleObserver.disconnect(); return window.toggleFlashes }), [])
  await page.getByRole('switch', { name: '启用接口 健康检查', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.endpoint-card [role="switch"]')?.getAttribute('aria-checked') === 'true')
  await page.getByRole('button', { name: '编辑接口 健康检查', exact: true }).click()
  await page.getByLabel('响应内容', { exact: true }).fill('{"updated":true}')
  await page.getByRole('button', { name: '保存接口', exact: true }).click()
  await page.locator('.endpoint-dialog').waitFor({ state: 'hidden' })
  assert.deepEqual(await (await fetch(url)).json(), { updated: true })
  await page.getByRole('button', { name: '编辑接口 健康检查', exact: true }).click()
  await page.getByLabel('响应内容', { exact: true }).fill('{broken')
  assert.equal(await page.getByLabel('响应内容', { exact: true }).getAttribute('aria-invalid'), 'true')
  assert.equal(await page.getByRole('button', { name: '美化 JSON', exact: true }).isDisabled(), true)
  await page.locator('#json-validation').scrollIntoViewIfNeeded()
  await screenshot(page, 'json-invalid')
  await page.getByLabel('响应格式', { exact: true }).selectOption('text')
  assert.equal(await page.getByRole('button', { name: '美化 JSON', exact: true }).count(), 0)
  await page.getByLabel('响应格式', { exact: true }).selectOption('json')
  await page.getByRole('button', { name: '保存接口', exact: true }).click()
  await page.locator('.toast.error').filter({ hasText: 'JSON' }).waitFor()
  // 关闭弹窗时保留未保存提示，取消继续编辑、放弃回到卡片。
  await page.keyboard.press('Escape')
  dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '放弃修改', exact: true }) })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('响应内容', { exact: true }).inputValue(), '{broken')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.locator('.endpoint-dialog').waitFor({ state: 'hidden' })
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await waitTheme(page, 'dark')
  await page.getByLabel('语言', { exact: true }).selectOption('en')
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
  const updatePanel = page.getByRole('region', { name: 'Application updates', exact: true })
  const updateState = await page.evaluate(() => window.app.updater.getSnapshot())
  assert.equal(updateState.ok, true)
  if (updateState.data.mode === 'demo') {
    await updatePanel.getByRole('button', { name: 'Demo: check for updates', exact: true }).click()
    await updatePanel.getByRole('button', { name: 'Demo: download progress', exact: true }).click()
    await updatePanel.getByText(/Demo complete/).waitFor()
  } else {
    assert.equal(updateState.data.repository, 'Bing0722/BingTools')
    await updatePanel.getByText('BingTools 0.3.0', { exact: false }).waitFor()
  }
  assert.equal((await page.evaluate(() => window.app.updater.install())).ok, false)
  await updatePanel.scrollIntoViewIfNeeded()
  await screenshot(page, 'update-demo')
  assert.equal(await application.evaluate(({ Menu }) => Menu.getApplicationMenu().items.some((item) => item.label === 'Edit')), true)
  await page.getByRole('link', { name: 'Server simulator', exact: true }).click()
  assert.equal(await page.evaluate(async () => { const result = await window.app.simulator.getSnapshot(); return result.data.config.customers.find((entry) => entry.id === result.data.config.selectedCustomerId).endpoints[0].body }), '{"updated":true}')
  await page.getByRole('heading', { name: 'Server simulator', exact: true }).waitFor()
  await screenshot(page, 'simulator-dark')
  await page.getByRole('button', { name: 'Notifications', exact: true }).click()
  await page.getByRole('dialog').getByText('Server started', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Mark all as read', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Notifications')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(850, 620))
  await page.waitForFunction(() => window.innerWidth < 960)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  assert.equal(await page.locator('.endpoint-card').first().evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth), true)
  const logHeight = await page.locator('.log-panel').evaluate((element) => element.getBoundingClientRect().height)
  await page.getByRole('button', { name: 'Collapse logs', exact: true }).click()
  await page.waitForFunction((height) => {
    const current = document.querySelector('.log-panel').getBoundingClientRect().height
    return current > 44 && current < height
  }, logHeight)
  await page.waitForFunction(() => document.querySelector('.log-panel').getBoundingClientRect().height <= 44)
  assert.equal(await page.locator('.log-entries').getAttribute('inert'), '')
  await screenshot(page, 'logs-collapsed')
  await page.getByRole('button', { name: 'Expand logs', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.log-panel').getBoundingClientRect().height > 90)
  assert.equal(await page.locator('.log-entries').getAttribute('inert'), null)
  await screenshot(page, 'simulator-narrow')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 560))
  await page.waitForFunction(() => window.innerWidth <= 800)
  assert.equal(await page.locator('.log-panel').evaluate((element) => element.getBoundingClientRect().bottom <= window.innerHeight + 1), true)
  assert.equal(await page.locator('.endpoint-board').evaluate((element) => element.getBoundingClientRect().bottom <= document.querySelector('.log-panel').getBoundingClientRect().top + 1), true)
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(850, 620))
  await goSettings(page)
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await waitTheme(page, 'light')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800))
  await page.waitForFunction(() => window.innerWidth >= 960)
  await page.getByRole('link', { name: 'Server simulator', exact: true }).click()
  await page.getByRole('heading', { name: 'Server simulator', exact: true }).waitFor()
  await screenshot(page, 'simulator-light')
  await page.getByRole('button', { name: 'Stop server', exact: true }).click()
  await page.locator('.runtime-badge').filter({ hasText: 'Stopped' }).waitFor()
  await assert.rejects(fetch(url))
  // 端口占用必须有页面错误和通知中心记录。
  await new Promise((resolve) => reserved.listen(port, '127.0.0.1', resolve))
  await page.getByRole('button', { name: 'Start server', exact: true }).click()
  await page.locator('.toast.error').filter({ hasText: 'port is in use' }).waitFor()
  assert.equal(await page.locator('.simulator-top [role="alert"]').count(), 0)
  await page.getByRole('button', { name: 'Notifications', exact: true }).click()
  await page.getByRole('dialog').getByText(/port is in use/).waitFor()
  await page.getByRole('button', { name: 'Clear notifications', exact: true }).click()
  await page.keyboard.press('Escape')
  await new Promise((resolve) => reserved.close(resolve))
  await page.getByRole('button', { name: 'Start server', exact: true }).click()
  await page.locator('.runtime-badge').filter({ hasText: 'Running' }).waitFor()
  const rejected = await page.evaluate(() => window.app.settings.update({ theme: 'invalid' }))
  assert.equal(rejected.ok, false)
  // 关闭窗口（macOS 应用仍在）和重新激活，都不能留下或自动启动监听。
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
  await page.waitForEvent('close')
  await assert.rejects(fetch(url))
  if (process.platform === 'darwin') {
    const nextWindow = application.waitForEvent('window')
    await application.evaluate(({ app }) => app.emit('activate'))
    page = await nextWindow
    await page.locator('.runtime-badge').filter({ hasText: 'Stopped' }).waitFor()
    await assert.rejects(fetch(url))
  }
  await application.close(); application = undefined
  page = await launch('en')
  await waitTheme(page, 'light')
  await page.locator('.runtime-badge').filter({ hasText: 'Stopped' }).waitFor()
  assert.equal(await page.getByLabel('Customer', { exact: true }).textContent(), '集成验证客户')
  assert.equal(await page.evaluate(async () => { const result = await window.app.simulator.getSnapshot(); return result.data.config.customers.find((entry) => entry.id === result.data.config.selectedCustomerId).endpoints[0].body }), '{"updated":true}')
  const saved = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'))
  assert.equal(saved.language, 'en')
  // 新增时可复制客户；重名以通知提示，改名不影响接口。
  const original = (await page.evaluate(() => window.app.simulator.getSnapshot())).data.config.customers[0]
  await page.getByRole('button', { name: 'Add customer', exact: true }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByLabel('Copy from customer', { exact: true }).selectOption(original.id)
  assert.equal(await dialog.getByLabel('Port', { exact: true }).inputValue(), String(original.port))
  await dialog.getByLabel('Customer name', { exact: true }).fill(original.name)
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.toast.error').filter({ hasText: 'already exists' }).waitFor()
  assert.equal(await dialog.isVisible(), true)
  await dialog.getByLabel('Customer name', { exact: true }).fill('Copied customer')
  await screenshot(page, 'copy-customer')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('Customer', { exact: true }).locator('option').count(), 2)
  assert.equal(await page.evaluate(async () => { const result = await window.app.simulator.getSnapshot(); return result.data.config.customers.find((entry) => entry.id === result.data.config.selectedCustomerId).endpoints[0].body }), '{"updated":true}')
  await page.getByRole('button', { name: 'Edit customer', exact: true }).click()
  dialog = page.getByRole('dialog')
  assert.equal(await dialog.getByLabel('Copy from customer', { exact: true }).count(), 0)
  await dialog.getByLabel('Customer name', { exact: true }).fill('Renamed customer')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.getByLabel('Customer', { exact: true }).locator('option:checked').textContent(), 'Renamed customer')
  const finalConfig = (await page.evaluate(() => window.app.simulator.getSnapshot())).data.config
  assert.equal(finalConfig.customers[0].name, original.name)
  assert.notEqual(finalConfig.customers[1].endpoints[0].id, original.endpoints[0].id)
  // 真实拖拽和键盘排序；保存到主进程后重启仍按新顺序显示。
  for (const [name, path] of [['Second endpoint', '/second'], ['Third endpoint', '/third']]) {
    await page.getByRole('button', { name: 'Add endpoint', exact: true }).click()
    await page.getByLabel('Endpoint name', { exact: true }).fill(name)
    await page.getByLabel('URL path', { exact: true }).fill(path)
    await page.getByRole('button', { name: 'Save endpoint', exact: true }).click()
    await page.locator('.endpoint-dialog').waitFor({ state: 'hidden' })
  }
  const orderBefore = await page.locator('.endpoint-card').evaluateAll((cards) => cards.map((card) => card.dataset.endpointId))
  await page.getByRole('button', { name: 'Move endpoint 健康检查', exact: true }).dragTo(page.locator('.endpoint-card').last())
  await page.waitForFunction((id) => document.querySelector('.endpoint-card:last-child')?.getAttribute('data-endpoint-id') === id, orderBefore[0])
  await page.waitForFunction(async (id) => {
    const result = await window.app.simulator.getSnapshot()
    return result.data.config.customers.find((entry) => entry.id === result.data.config.selectedCustomerId).endpoints.at(-1).id === id
  }, orderBefore[0])
  await page.getByRole('button', { name: 'Move endpoint 健康检查', exact: true }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.waitForFunction((id) => document.querySelectorAll('.endpoint-card')[1]?.getAttribute('data-endpoint-id') === id, orderBefore[0])
  const expectedOrder = [orderBefore[1], orderBefore[0], orderBefore[2]]
  await page.waitForFunction(async (ids) => {
    const result = await window.app.simulator.getSnapshot()
    return JSON.stringify(result.data.config.customers.find((entry) => entry.id === result.data.config.selectedCustomerId).endpoints.map((entry) => entry.id)) === JSON.stringify(ids)
  }, expectedOrder)
  await screenshot(page, 'endpoint-cards')
  await application.close(); application = undefined
  page = await launch('en')
  assert.deepEqual(await page.locator('.endpoint-card').evaluateAll((cards) => cards.map((card) => card.dataset.endpointId)), expectedOrder)
  await page.getByRole('button', { name: 'Edit endpoint 健康检查', exact: true }).click()
  await screenshot(page, 'endpoint-dialog')
  await page.getByLabel('Endpoint name', { exact: true }).fill('Edited health')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Discard', exact: true }) }).getByRole('button', { name: 'Save', exact: true }).click()
  await page.locator('.endpoint-dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Edit endpoint Edited health', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Edit endpoint Third endpoint', exact: true }).click()
  await page.getByRole('button', { name: 'Delete endpoint', exact: true }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.locator('.endpoint-dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.endpoint-card').count(), 2)
  assert.deepEqual(errors, [])
  console.log('PASS: HTTP workflow, hot updates, logs/redaction, unsaved edits, notifications, language persistence, themes, narrow layout, window-close/reopen and restart; no renderer errors.')
} catch (error) {
  const page = application?.windows()[0]
  if (page) {
    await page.screenshot({ path: 'test-results/failure.png' }).catch(() => {})
    console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 3500))
  }
  console.error(errors)
  throw error
} finally {
  if (reserved.listening) await new Promise((resolve) => reserved.close(resolve))
  if (application) await application.close()
  await rm(directory, { recursive: true, force: true })
}
