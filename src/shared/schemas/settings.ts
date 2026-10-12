import { z } from 'zod'

export const preferencesSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
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
  schemaVersion: z.literal(1),
  windowBounds: windowBoundsSchema.optional(),
}).strict()

export type AppSettings = z.infer<typeof settingsSchema>
export type Preferences = z.infer<typeof preferencesSchema>
export type SettingsPatch = z.infer<typeof settingsPatchSchema>
export const defaultSettings: AppSettings = {
  schemaVersion: 1, theme: 'system', sidebarCollapsed: false, sidebarWidth: 240,
}
export function preferencesOf(settings: AppSettings): Preferences {
  return preferencesSchema.parse({
    theme: settings.theme, sidebarCollapsed: settings.sidebarCollapsed,
    sidebarWidth: settings.sidebarWidth,
  })
}
