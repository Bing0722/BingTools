import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsRepository } from '../src/main/storage/settings-repository'
import { settingsPatchSchema } from '../src/shared/schemas/settings'
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
  it('rejects privileged, unknown and out-of-range fields', () => {
    for (const input of [{ windowBounds: { x: 0 } }, { schemaVersion: 2 }, { theme: 'blue' }, { sidebarWidth: 10 }, { sidebarCollapsed: 'yes' }]) {
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
  it('migrates v1 without losing theme, layout or window bounds', async () => {
    const { repository, path } = await fixture()
    const old = { schemaVersion: 1, theme: 'dark', sidebarWidth: 280, sidebarCollapsed: true, windowBounds: { x: 10, y: 20, width: 1000, height: 700 } }
    await writeFile(path, JSON.stringify(old))
    expect(await repository.load()).toEqual({ ...old, schemaVersion: 2, language: 'system' })
    await repository.update({ language: 'en' })
    expect(await new SettingsRepository(path).load()).toMatchObject({ language: 'en', theme: 'dark', windowBounds: old.windowBounds })
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
