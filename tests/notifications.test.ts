import { afterEach, expect, it, vi } from 'vitest'
import { useNotifications } from '../src/renderer/src/stores/notification-store'
import zh from '../src/renderer/src/i18n/zh-CN.json'
import { resolveLanguage } from '../src/renderer/src/i18n'
import en from '../src/renderer/src/i18n/en.json'

afterEach(() => { useNotifications.getState().clear(); vi.useRealTimers() })
it('merges short bursts, retains 100 events, and supports read, dismiss and clear', () => {
  vi.useFakeTimers()
  const store = useNotifications.getState()
  store.push('PORT_IN_USE', 'error'); store.push('PORT_IN_USE', 'error')
  expect(useNotifications.getState().items).toHaveLength(1)
  expect(useNotifications.getState().items[0].count).toBe(2)
  store.markRead(); expect(useNotifications.getState().items[0].read).toBe(true)
  vi.advanceTimersByTime(6000)
  store.push('PORT_IN_USE', 'error')
  expect(useNotifications.getState().items).toHaveLength(2)
  for (let index = 0; index < 110; index++) store.push(`ERROR_${index}`, 'error')
  expect(useNotifications.getState().items).toHaveLength(100)
  expect(useNotifications.getState().toasts).toHaveLength(3)
  store.dismiss(useNotifications.getState().toasts[0].id)
  expect(useNotifications.getState().toasts).toHaveLength(2)
  store.clear(); expect(useNotifications.getState().items).toEqual([])
})
it('keeps ordinary feedback out of the notification center', () => {
  useNotifications.getState().push('endpointSaved')
  expect(useNotifications.getState().items).toEqual([])
  expect(useNotifications.getState().toasts[0].key).toBe('endpointSaved')
})
it('provides matching nonempty English and Chinese resources', () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  for (const value of [...Object.values(en), ...Object.values(zh)]) expect(value.length).toBeGreaterThan(0)
})

it('maps system locales and honors explicit language preferences', () => {
  expect(resolveLanguage('system', 'zh-TW')).toBe('zh-CN')
  expect(resolveLanguage('system', 'de-DE')).toBe('en')
  expect(resolveLanguage('en', 'zh-CN')).toBe('en')
  expect(resolveLanguage('zh-CN', 'en-US')).toBe('zh-CN')
})
