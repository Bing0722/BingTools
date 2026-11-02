import { _electron as electron } from 'playwright'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
const directory = await mkdtemp(join(tmpdir(), 'bingtools-route-stability-'))
await writeFile(join(directory, 'settings.json'), JSON.stringify({ schemaVersion: 2, language: 'en', theme: 'light', sidebarWidth: 240, sidebarCollapsed: false }))
let app
const errors = []
try {
  const env = { ...process.env, BINGTOOLS_TEST_DATA: directory }; delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [resolve('.')], env })
  const page = await app.firstWindow(); page.setDefaultTimeout(10000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('heading', { name: 'Server simulator', exact: true }).waitFor()
  for (const theme of ['light', 'dark']) {
    await page.evaluate(async (theme) => { await window.app.settings.update({ theme, glassEnabled: theme === 'dark' }) }, theme)
    await page.reload()
    await page.getByRole('heading', { name: 'Server simulator', exact: true }).waitFor()
    for (const target of ['/motion', '/simulator', '/motion', '/simulator']) {
      const frames = await page.evaluate(async (target) => {
        const samples = []
        document.querySelector(`.app-shell > .sidebar a[href="#${target}"]`).click()
        await new Promise((resolve) => {
          const start = performance.now()
          function frame() {
            const main = document.querySelector('.page-scroll'), content = main.querySelector('.simulator-page')
            if (content && location.hash === `#${target}`) {
              const bounds = content.getBoundingClientRect(), parent = main.getBoundingClientRect()
              samples.push({ x: bounds.x - parent.x, y: bounds.y - parent.y, width: bounds.width, height: bounds.height, transform: getComputedStyle(content).transform, opacity: getComputedStyle(content).opacity })
            }
            if (performance.now() - start < 360) requestAnimationFrame(frame)
            else resolve()
          }
          requestAnimationFrame(frame)
        })
        return samples
      }, target)
      assert.ok(frames.length > 3)
      assert.ok(frames.every((frame) => frame.transform === 'none' && frame.opacity === '1' && Math.abs(frame.x) < .5 && Math.abs(frame.y) < .5))
      assert.ok(frames.every((frame) => Math.abs(frame.width - frames[0].width) < .5 && Math.abs(frame.height - frames[0].height) < .5))
    }
  }
  assert.deepEqual(errors, [])
  console.log('PASS: repeated HTTP/motion route switches stay aligned and opaque on every sampled frame in light and dark glass themes.')
} finally { await app?.close(); await rm(directory, { recursive: true, force: true }) }
