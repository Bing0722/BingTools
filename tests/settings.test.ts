import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsRepository } from '../src/main/storage/settings-repository'
import { appearanceDefaults, parseSettings, settingsPatchSchema } from '../src/shared/schemas/settings'
import { isTrustedUrl } from '../src/main/ipc/trusted-source'

const directories: string[] = []
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'bingtools-unit-'))
  directories.push(directory)
  const path = join(directory, 'settings.json')
  return { directory, path, repository: new SettingsRepository(path) }
}
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe('settings boundary', () => {
  it('accepts appearance choices but rejects unknown colors, font modes and CSS/path injection', () => {
    expect(settingsPatchSchema.safeParse({ themeColor: 'violet', uiFont: 'local', localFont: 'Microsoft YaHei UI' }).success).toBe(true)
    for (const patch of [{ themeColor: '#fff' }, { uiFont: 'remote' }, { localFont: 'url(https://example.com)' }, { localFont: 'Arial; color:red' }, { localFont: '/tmp/font.ttf' }, { localFont: '' }, { localFont: 'A'.repeat(101) }]) {
      expect(settingsPatchSchema.safeParse(patch).success).toBe(false)
    }
  })
  it('rejects privileged, unknown and out-of-range fields', () => {
    for (const input of [{ windowBounds: { x: 0 } }, { schemaVersion: 2 }, { theme: 'blue' }, { sidebarWidth: 10 }, { sidebarCollapsed: 'yes' }, { notificationPosition: 'center' }]) {
      expect(settingsPatchSchema.safeParse(input).success).toBe(false)
    }
    expect(settingsPatchSchema.safeParse({ theme: 'dark', sidebarWidth: 240 }).success).toBe(true)
  })
  it('accepts hash routing but rejects another document or origin', () => {
    expect(isTrustedUrl('file:///app/index.html#/settings', 'file:///app/index.html')).toBe(true)
    expect(isTrustedUrl('file:///other/index.html', 'file:///app/index.html')).toBe(false)
    expect(isTrustedUrl('http://evil.test/', 'http://localhost:5173/')).toBe(false)
    expect(isTrustedUrl('http://localhost:5173/other', 'http://localhost:5173/')).toBe(false)
    expect(isTrustedUrl('not a url', 'file:///app/index.html')).toBe(false)
  })
})
describe('settings persistence', () => {
  it('migrates v3 appearance without changing existing preferences and saves new fields atomically', async () => {
    const { repository, path } = await fixture()
    const old = { schemaVersion: 3, theme: 'dark', language: 'zh-CN', notificationPosition: 'top-left', sidebarWidth: 280, sidebarCollapsed: true }
    await writeFile(path, JSON.stringify(old))
    expect(await repository.load()).toEqual({ ...old, ...appearanceDefaults, schemaVersion: 5 })
    await repository.update({ themeColor: 'green', uiFont: 'local', localFont: 'PingFang SC' })
    expect(await new SettingsRepository(path).load()).toMatchObject({ themeColor: 'green', uiFont: 'local', localFont: 'PingFang SC', theme: 'dark' })
    const before = repository.get()
    await expect(repository.update({ localFont: 'bad/path' })).rejects.toThrow()
    expect(repository.get()).toEqual(before)
    await mkdir(`${path}.tmp`)
    await expect(repository.update({ themeColor: 'rose' })).rejects.toThrow()
    expect(await new SettingsRepository(path).load()).toEqual(before)
    expect(repository.get()).toEqual(before)
    await rm(`${path}.tmp`, { recursive: true })
    await repository.update({ ...appearanceDefaults, theme: 'system' })
    expect(repository.get()).toMatchObject({ ...appearanceDefaults, theme: 'system', language: 'zh-CN', notificationPosition: 'top-left' })
    expect(() => parseSettings({ ...old, uiFont: 'noto' })).toThrow()
  })
  it('migrates v1 without losing theme, layout or window bounds', async () => {
    const { repository, path } = await fixture()
    const old = { schemaVersion: 1, theme: 'dark', sidebarWidth: 280, sidebarCollapsed: true, windowBounds: { x: 10, y: 20, width: 1000, height: 700 } }
    await writeFile(path, JSON.stringify(old))
    expect(await repository.load()).toEqual({ ...old, ...appearanceDefaults, schemaVersion: 5, language: 'system', notificationPosition: 'bottom-right' })
    await repository.update({ language: 'en' })
    expect(await new SettingsRepository(path).load()).toMatchObject({ language: 'en', theme: 'dark', windowBounds: old.windowBounds })
  })
  it('migrates v2 and persists notification position', async () => {
    const { repository, path } = await fixture()
    const old = { schemaVersion: 2, theme: 'light', language: 'en', sidebarWidth: 240, sidebarCollapsed: false }
    await writeFile(path, JSON.stringify(old))
    expect(await repository.load()).toEqual({ ...old, ...appearanceDefaults, schemaVersion: 5, notificationPosition: 'bottom-right' })
    await repository.update({ notificationPosition: 'top-left' })
    expect(await new SettingsRepository(path).load()).toMatchObject({ language: 'en', notificationPosition: 'top-left' })
  })
  it('restores saved settings after restart', async () => {
    const { repository, path } = await fixture()
    expect((await repository.load()).theme).toBe('system')
    await repository.update({ theme: 'dark', sidebarCollapsed: true })
    const restarted = new SettingsRepository(path)
    expect(await restarted.load()).toMatchObject({ theme: 'dark', sidebarCollapsed: true })
  })
  it('serializes concurrent updates without losing fields', async () => {
    const { repository, path } = await fixture()
    await repository.load()
    await Promise.all([repository.update({ theme: 'dark' }), repository.update({ sidebarWidth: 280 }), repository.update({ sidebarCollapsed: true })])
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ theme: 'dark', sidebarWidth: 280, sidebarCollapsed: true })
  })
  it('backs up malformed data before using defaults', async () => {
    const { repository, directory, path } = await fixture()
    await writeFile(path, '{broken')
    expect((await repository.load()).theme).toBe('system')
    expect(repository.warning).toBe('RECOVERED')
    const backup = (await readdir(directory)).find((name) => name.includes('.corrupt-'))!
    expect(await readFile(join(directory, backup), 'utf8')).toBe('{broken')
    await repository.update({ theme: 'light' })
  })
  it('never overwrites settings from a newer version', async () => {
    const { repository, path } = await fixture()
    const newer = JSON.stringify({ schemaVersion: 99, custom: 'preserve' })
    await writeFile(path, newer)
    await repository.load()
    await expect(repository.update({ theme: 'dark' })).rejects.toThrow('SETTINGS_READ_ONLY')
    expect(await readFile(path, 'utf8')).toBe(newer)
  })
  it('recovers the write queue after an invalid update', async () => {
    const { repository } = await fixture()
    await repository.load()
    await expect(repository.update({ sidebarWidth: -1 })).rejects.toThrow()
    expect((await repository.update({ theme: 'light' })).theme).toBe('light')
  })
})

describe('glass preferences', () => {
  it('validates intensity and migrates v4 without enabling the effect', async () => {
    for (const glassIntensity of [0, 101, 2.5, '50', NaN]) expect(settingsPatchSchema.safeParse({ glassIntensity }).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ glassEnabled: 'yes' }).success).toBe(false)
    const { repository, path } = await fixture()
    const old = { schemaVersion: 4, theme: 'dark', language: 'en', notificationPosition: 'top-left', sidebarWidth: 280, sidebarCollapsed: true, themeColor: 'rose', uiFont: 'noto', localFont: 'Arial' }
    await writeFile(path, JSON.stringify(old))
    expect(await repository.load()).toEqual({ ...old, schemaVersion: 5, glassEnabled: false, glassIntensity: 55 })
    await repository.update({ glassEnabled: true, glassIntensity: 100 })
    expect(await new SettingsRepository(path).load()).toMatchObject({ glassEnabled: true, glassIntensity: 100 })
    await mkdir(`${path}.tmp`)
    await expect(repository.update({ glassIntensity: 1 })).rejects.toThrow()
    expect(repository.get().glassIntensity).toBe(100)
    expect(await new SettingsRepository(path).load()).toMatchObject({ glassEnabled: true, glassIntensity: 100 })
    await rm(`${path}.tmp`, { recursive: true })
    await repository.update({ glassEnabled: false })
    expect(repository.get().glassIntensity).toBe(100)
    await repository.update(appearanceDefaults)
    expect(repository.get()).toMatchObject({ glassEnabled: false, glassIntensity: 55 })
    expect(() => parseSettings({ ...old, glassEnabled: true })).toThrow()
  })
})
