import { afterEach, expect, it, vi } from 'vitest'
import { UpdateController, demoBackend, type UpdateBackend } from '../src/main/services/update-controller'
const options = { mode: 'github' as const, currentVersion: '0.2.0', repository: 'example/app' }
function backend(): UpdateBackend { return { check: vi.fn(async () => '0.3.0'), download: vi.fn(async (progress) => { progress(50); progress(100) }), install: vi.fn() } }
afterEach(() => vi.useRealTimers())
it('runs the offline demo without installation or external effects', async () => {
  vi.useFakeTimers()
  const controller = new UpdateController(demoBackend('0.2.0'), { ...options, mode: 'demo' })
  const check = controller.check()
  expect(controller.snapshot().phase).toBe('checking')
  await vi.runAllTimersAsync(); expect((await check).version).toBe('0.2.1')
  const download = controller.download()
  await vi.runAllTimersAsync(); expect((await download).progress).toBe(100)
  expect(controller.snapshot().phase).toBe('downloaded')
  await expect(controller.install()).rejects.toThrow('UPDATE_DEMO_ONLY')
})
it('serializes actions, enforces phases, publishes progress and cleans subscriptions', async () => {
  let finish!: (version: string) => void
  const source = backend(); source.check = () => new Promise((resolve) => { finish = resolve })
  const controller = new UpdateController(source, options)
  await expect(controller.download()).rejects.toThrow('UPDATE_CHECK_FIRST')
  await expect(controller.install()).rejects.toThrow('UPDATE_DOWNLOAD_FIRST')
  const listener = vi.fn(); const off = controller.subscribe(listener)
  const check = controller.check()
  await expect(controller.check()).rejects.toThrow('UPDATE_BUSY')
  finish('0.3.0'); await check
  await controller.download()
  expect(listener.mock.calls.some(([state]) => state.progress === 50)).toBe(true)
  off(); listener.mockClear()
  await controller.install(); expect(listener).not.toHaveBeenCalled()
})
it('flushes configuration and stops service before invoking installation', async () => {
  const order: string[] = []
  const source = backend(); source.install = () => { order.push('install') }
  const controller = new UpdateController(source, options, async () => { order.push('shutdown') })
  await controller.check(); await controller.download(); await controller.install()
  expect(order).toEqual(['shutdown', 'install'])
})
it('handles no update and redacts backend failure details, with retry', async () => {
  const source = backend()
  source.check = vi.fn().mockRejectedValueOnce(new Error('secret URL')).mockResolvedValueOnce(undefined).mockResolvedValue('0.3.0')
  const controller = new UpdateController(source, options)
  expect(await controller.check()).toMatchObject({ phase: 'error', error: 'UPDATE_CHECK_FAILED' })
  expect(await controller.check()).toMatchObject({ phase: 'current', error: undefined })
  await controller.check()
  source.download = vi.fn().mockRejectedValue(new Error('private path'))
  expect(await controller.download()).toMatchObject({ phase: 'error', error: 'UPDATE_DOWNLOAD_FAILED' })
})
it('blocks real updates in unpackaged mode and does not install after shutdown failure', async () => {
  const source = backend()
  await expect(new UpdateController(source, { ...options, mode: 'unavailable' }).check()).rejects.toThrow('UPDATE_PACKAGED_ONLY')
  expect(source.check).not.toHaveBeenCalled()
  const controller = new UpdateController(source, options, async () => { throw new Error('flush') })
  await controller.check(); await controller.download()
  expect(await controller.install()).toMatchObject({ phase: 'error', error: 'UPDATE_INSTALL_FAILED' })
  expect(source.install).not.toHaveBeenCalled()
})

it('recovers application lifecycle after asynchronous installer failure', async () => {
  const recover = vi.fn()
  const controller = new UpdateController(backend(), options, async () => {}, recover)
  await controller.check(); await controller.download(); await controller.install()
  controller.installFailed()
  expect(recover).toHaveBeenCalledOnce()
  expect(controller.snapshot()).toMatchObject({ phase: 'error', error: 'UPDATE_INSTALL_FAILED' })
})

it('preserves release notes and enforces manual installation for unsigned builds', async () => {
  const source = backend()
  source.check = async () => ({ version: '0.3.0', releaseNotes: '<script>untrusted notes</script>', releaseDate: '2026-10-14T00:00:00Z' })
  const controller = new UpdateController(source, { ...options, canInstall: false })
  expect(await controller.check()).toMatchObject({ version: '0.3.0', releaseNotes: '<script>untrusted notes</script>' })
  await expect(controller.download()).rejects.toThrow('UPDATE_MANUAL_ONLY')
  await expect(controller.install()).rejects.toThrow('UPDATE_MANUAL_ONLY')
  expect(source.download).not.toHaveBeenCalled()
})
