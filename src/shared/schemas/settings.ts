import { z } from 'zod'

export const themeColors = ['graphite', 'blue', 'violet', 'green', 'amber', 'rose'] as const
export const glassDefaults = { glassEnabled: false, glassIntensity: 55 } as const
export const appearanceDefaults = { ...glassDefaults, themeColor: 'graphite', uiFont: 'system', localFont: 'Arial' } as const
export const localFontSchema = z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} ._()-]+$/u)

export const preferencesSchema = z.object({
  notificationPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
  theme: z.enum(['system', 'light', 'dark']),
  glassEnabled: z.boolean(),
  glassIntensity: z.number().int().min(1).max(100),
  themeColor: z.enum(themeColors),
  uiFont: z.enum(['system', 'noto', 'local']),
  localFont: localFontSchema,
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
  schemaVersion: z.literal(5),
  windowBounds: windowBoundsSchema.optional(),
}).strict()

export type AppSettings = z.infer<typeof settingsSchema>
export type Preferences = z.infer<typeof preferencesSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export const defaultSettings: AppSettings = {
  schemaVersion: 5, ...appearanceDefaults, notificationPosition: 'bottom-right', theme: 'system', language: 'system', sidebarCollapsed: false, sidebarWidth: 240,
}
export function preferencesOf(settings: AppSettings): Preferences {
  return preferencesSchema.parse({
    glassEnabled: settings.glassEnabled, glassIntensity: settings.glassIntensity,
    themeColor: settings.themeColor, uiFont: settings.uiFont, localFont: settings.localFont,
    notificationPosition: settings.notificationPosition,
    language: settings.language,
    theme: settings.theme, sidebarCollapsed: settings.sidebarCollapsed,
    sidebarWidth: settings.sidebarWidth,
  })
}

/** 逐版补齐偏好，保留原有主题、语言、布局和窗口坐标。 */
export function parseSettings(value: unknown): AppSettings {
  const legacy = settingsSchema.omit({ glassEnabled: true, glassIntensity: true, themeColor: true, uiFont: true, localFont: true })
  if (typeof value === 'object' && value && 'schemaVersion' in value) {
    if (value.schemaVersion === 4) {
      const old = settingsSchema.omit({ glassEnabled: true, glassIntensity: true }).extend({ schemaVersion: z.literal(4) }).parse(value)
      return settingsSchema.parse({ ...old, ...glassDefaults, schemaVersion: 5 })
    }
    if (value.schemaVersion === 1) {
      const old = legacy.omit({ language: true, notificationPosition: true }).extend({ schemaVersion: z.literal(1) }).parse(value)
      return settingsSchema.parse({ ...old, ...appearanceDefaults, schemaVersion: 5, language: 'system', notificationPosition: 'bottom-right' })
    }
    if (value.schemaVersion === 2) {
      const old = legacy.omit({ notificationPosition: true }).extend({ schemaVersion: z.literal(2) }).parse(value)
      return settingsSchema.parse({ ...old, ...appearanceDefaults, schemaVersion: 5, notificationPosition: 'bottom-right' })
    }
    if (value.schemaVersion === 3) {
      const old = legacy.extend({ schemaVersion: z.literal(3) }).parse(value)
      return settingsSchema.parse({ ...old, ...appearanceDefaults, schemaVersion: 5 })
    }
  }
  return settingsSchema.parse(value)
}
