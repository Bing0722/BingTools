import { expect, it } from 'vitest'
import { colorPalettes, uiFontStack } from '../src/renderer/src/lib/appearance'
function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map((part) => {
    const v = parseInt(part, 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05) }
it('keeps primary button labels readable for every light/dark palette', () => {
  for (const palette of Object.values(colorPalettes)) {
    expect(contrast(palette.light, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.dark, '#111827')).toBeGreaterThanOrEqual(4.5)
  }
})
it('quotes local font names and always retains system fallbacks', () => {
  expect(uiFontStack({ uiFont: 'local', localFont: 'Microsoft YaHei UI' })).toMatch(/^"Microsoft YaHei UI", system-ui/)
  expect(uiFontStack({ uiFont: 'noto', localFont: 'Arial' })).toContain('"Noto Sans SC Variable"')
  expect(uiFontStack({ uiFont: 'system', localFont: 'Arial' })).toContain('sans-serif')
})
