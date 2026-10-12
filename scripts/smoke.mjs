import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import assert from 'node:assert/strict'

const directory = await mkdtemp(join(tmpdir(), 'bingtools-desktop-'))
const errors = []
let application
const executablePath = process.env.BINGTOOLS_EXECUTABLE
async function launch() {
  const environment = { ...process.env, BINGTOOLS_TEST_DATA: directory }
  delete environment.ELECTRON_RUN_AS_NODE
  application = await electron.launch({
    ...(executablePath ? { executablePath, args: [`--user-data-dir=${directory}`] } : { args: [resolve('.')] }),
    env: environment,
  })
  const page = await application.firstWindow()
  page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: /留一点空间/ }).waitFor()
  assert.equal(await page.getByRole('link', { name: '工作台', exact: true }).evaluate((element) => getComputedStyle(element).display), 'flex')
  console.log('Window ready')
  return page
}
async function waitTheme(page, theme) {
  await page.waitForFunction((dark) => document.documentElement.classList.contains('dark') === dark, theme === 'dark')
}
try {
  await mkdir('test-results', { recursive: true })
  let page = await launch()
  await page.screenshot({ path: 'test-results/workspace.png' })
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await waitTheme(page, 'dark')
  await page.getByLabel('侧栏宽度').selectOption('280')
  await page.waitForFunction(() => document.querySelector('.app-shell')?.getAttribute('style')?.includes('280'))
  await page.screenshot({ path: 'test-results/settings-dark.png' })
  const saved = JSON.parse(await readFile(join(directory, 'settings.json'), 'utf8'))
  assert.equal(saved.theme, 'dark')
  assert.equal(saved.sidebarWidth, 280)
  const rejected = await page.evaluate(() => window.app.settings.update({ theme: 'invalid' }))
  assert.equal(rejected.ok, false)
  await page.getByRole('button', { name: '恢复默认', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('link', { name: '示例空间', exact: true }).click()
  await page.getByLabel('预览状态').selectOption('error')
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await page.getByLabel('搜索示例').fill('灵感')
  await page.getByRole('link', { name: /灵感与随手记录.*一个用于/ }).click()
  await page.getByRole('heading', { name: '灵感与随手记录', exact: true }).waitFor()
  await page.getByRole('button', { name: '项目操作' }).click()
  await page.getByRole('menuitem', { name: '关于这个示例' }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: '返回示例空间' }).click()
  assert.equal(await page.getByLabel('搜索示例').inputValue(), '灵感')
  await page.getByLabel('搜索示例').fill('')
  await page.getByLabel('预览状态').selectOption('empty')
  await page.getByRole('heading', { name: '这里还没有内容' }).waitFor()
  await page.getByRole('button', { name: '显示所有示例' }).click()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(850, 620))
  await page.waitForFunction(() => window.innerWidth < 960)
  await page.getByRole('button', { name: '切换侧栏' }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
  await page.screenshot({ path: 'test-results/narrow-dark.png' })
  await application.close()
  application = undefined
  page = await launch()
  await waitTheme(page, 'dark')
  await page.getByRole('link', { name: '设置', exact: true }).click()
  assert.equal(await page.getByLabel('侧栏宽度').inputValue(), '280')
  await page.getByRole('button', { name: '浅色', exact: true }).click()
  await waitTheme(page, 'light')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1200, 800))
  await page.getByRole('button', { name: '切换侧栏' }).click()
  await page.waitForFunction(() => document.querySelector('.app-shell')?.getAttribute('style')?.includes('56'))
  await page.getByRole('button', { name: '切换侧栏' }).click()
  await page.waitForFunction(() => document.querySelector('.app-shell')?.getAttribute('style')?.includes('280'))
  await page.getByRole('link', { name: '工作台', exact: true }).click()
  await page.screenshot({ path: 'test-results/workspace-light.png' })
  assert.deepEqual(errors, [])
  console.log('PASS: desktop navigation, real settings IPC, restart persistence, themes, dialogs, search, states, narrow layout and collapse; no renderer errors.')
} catch (error) {
  const page = application?.windows()[0]
  if (page) {
    await page.screenshot({ path: 'test-results/failure.png' }).catch(() => {})
    console.error((await page.locator('body').innerText().catch(() => '')).slice(0, 2000))
  }
  console.error(errors)
  throw error
} finally {
  if (application) await application.close()
  await rm(directory, { recursive: true, force: true })
}
