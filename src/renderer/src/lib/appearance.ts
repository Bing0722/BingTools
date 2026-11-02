/**
 * 外观辅助函数与统一色板：字体检测使用浏览器能力，字体选择始终保留系统回退。
 */
import type { Preferences } from '../../../shared/schemas/settings'
export const systemFontStack = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
export function uiFontStack(preferences: Pick<Preferences, 'uiFont' | 'localFont'>): string {
  if (preferences.uiFont === 'noto') return `"Noto Sans SC Variable", ${systemFontStack}`
  if (preferences.uiFont === 'local') return `${JSON.stringify(preferences.localFont)}, ${systemFontStack}`
  return systemFontStack
}
// 只检测约定的常用字体或用户明确填写的字体，不读取字体文件、不枚举系统目录。
export async function hasLocalFont(family: string): Promise<boolean> {
  try { await new FontFace('BingToolsLocalFontProbe', `local(${JSON.stringify(family)})`).load(); return true }
  catch { return false }
}
export const localFontCandidates = ['Microsoft YaHei UI', 'Microsoft YaHei', 'DengXian', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Heiti SC', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Arial', 'Verdana']
export const colorPalettes = {
  graphite: { light: '#252528', dark: '#f4f4f5' },
  blue: { light: '#2459cc', dark: '#8eb3ff' },
  violet: { light: '#7047c6', dark: '#bfa5f5' },
  green: { light: '#167352', dark: '#83cfad' },
  amber: { light: '#965600', dark: '#edc177' },
  rose: { light: '#b43c62', dark: '#efa2ba' },
} as const
