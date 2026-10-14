import { afterEach, expect, it } from 'vitest'
import { useSimulator } from '../src/renderer/src/stores/simulator-store'
import { useNotifications } from '../src/renderer/src/stores/notification-store'
import type { Result } from '../src/shared/contracts/app-api'
import type { SimulatorSnapshot } from '../src/shared/contracts/simulator'

afterEach(() => {
  useSimulator.setState({ busy:false, pendingToggle:undefined, error:undefined })
  useNotifications.getState().clear()
})
it('scopes pending toggles, rejects concurrent operations and cleans up failures', async () => {
  let finish!: (result: Result<SimulatorSnapshot>) => void
  const running = useSimulator.getState().run(() => new Promise((resolve) => { finish = resolve }), undefined, 'endpoint-id')
  expect(useSimulator.getState()).toMatchObject({ busy:true, pendingToggle:'endpoint-id' })
  let called = false
  expect(await useSimulator.getState().run(async () => { called = true; throw new Error('unexpected') })).toBe(false)
  expect(called).toBe(false)
  const before = useSimulator.getState().snapshot
  finish({ ok:false, error:{ code:'SAVE_FAILED', message:'SAVE_FAILED' } })
  expect(await running).toBe(false)
  expect(useSimulator.getState()).toMatchObject({ busy:false, pendingToggle:undefined, error:'SAVE_FAILED' })
  expect(useSimulator.getState().snapshot).toBe(before)
  expect(useNotifications.getState().items[0].key).toBe('SAVE_FAILED')
})
