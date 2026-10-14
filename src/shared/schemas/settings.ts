import { z } from 'zod'

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  language: z.enum(['system', 'zh-CN', 'en']),
  sidebarCollapsed: z.boolean(),
  sidebarWidth: z.number().int().min(200).max(320),
}).strict()
export const settingsPatchSchema = preferencesSchema.partial().strict()
export const windowBoundsSchema = z.object({
  x: z.number().int(), y: z.number().int(),
  width: z.number().int().min(400).max(10000),
  height: z.number().int().min(300).max(10000),
}).strict()
export const settingsSchema = preferencesSchema.extend({
  schemaVersion: z.literal(2),
  windowBounds: windowBoundsSchema.optional(),
}).strict()

export type AppSettings = z.infer<typeof settingsSchema>
export type Preferences = z.infer<typeof preferencesSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export const defaultSettings: AppSettings = {
  schemaVersion: 2, theme: 'system', language: 'system', sidebarCollapsed: false, sidebarWidth: 240,
}
export function preferencesOf(settings: AppSettings): Preferences {
  return preferencesSchema.parse({
    language: settings.language,
    theme: settings.theme, sidebarCollapsed: settings.sidebarCollapsed,
    sidebarWidth: settings.sidebarWidth,
  })
}

/** v1 仅增加语言默认值，保留原有主题、布局和窗口坐标。 */
export function parseSettings(value: unknown): AppSettings {
  if (typeof value === 'object' && value && 'schemaVersion' in value && value.schemaVersion === 1) {
    const old = settingsSchema.omit({ language: true }).extend({ schemaVersion: z.literal(1) }).parse(value)
    return settingsSchema.parse({ ...old, schemaVersion: 2, language: 'system' })
  }
  return settingsSchema.parse(value)
}
