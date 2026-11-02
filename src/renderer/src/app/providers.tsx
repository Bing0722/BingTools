/**
 * 应用级副作用集中处：加载设置、订阅主进程事件，并把偏好同步到文档根节点。
 */
import { colorPalettes, uiFontStack } from '@/lib/appearance'
import { connectUpdates } from '@/stores/update-store'
import { connectMotion } from '@/stores/motion-store'
import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@/stores/settings-store'
import { connectSimulator } from '@/stores/simulator-store'
import { useMedia } from '@/lib/use-media'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ToastHost } from '@/features/notifications/notification-center'
import { resolveLanguage } from '@/i18n'
export function Providers({ children }: { children: ReactNode }) {
  const { preferences, ready, load, systemLocale } = useSettings()
  const { t, i18n } = useTranslation()
  const systemDark = useMedia('(prefers-color-scheme: dark)')
  useEffect(() => { void load() }, [load])
  // 连接函数返回取消订阅，React 会在卸载及开发 StrictMode 重建 effect 时调用。
  useEffect(() => connectSimulator(), [])
  useEffect(() => connectMotion(), [])
  useEffect(() => connectUpdates(), [])
  useEffect(() => {
    // base-select 的 Esc 默认行为由浏览器执行；先于 Radix 的 document 监听截断传播，
    // 避免同一次按键关闭外层弹窗。不 preventDefault，保证菜单正常关闭并还原焦点。
    const handlePickerEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('select:open')) event.stopPropagation()
    }
    window.addEventListener('keydown', handlePickerEscape, true)
    return () => window.removeEventListener('keydown', handlePickerEscape, true)
  }, [])
  useEffect(() => {
    // 把已保存的主题转换为根节点 dark 类和浏览器原生控件配色。
    document.documentElement.classList.toggle('dark', preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark))
    document.documentElement.style.colorScheme = preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme
  }, [preferences.theme, systemDark])
  useEffect(() => {
    // 页面组件只消费统一 CSS 变量，避免每个页面分别维护配色和字体状态。
    document.documentElement.dataset.color = preferences.themeColor
    const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark)
    document.documentElement.style.setProperty('--theme-accent', colorPalettes[preferences.themeColor][dark ? 'dark' : 'light'])
    document.documentElement.style.setProperty('--font-ui', uiFontStack({ uiFont: preferences.uiFont, localFont: preferences.localFont }))
  }, [preferences.themeColor, preferences.uiFont, preferences.localFont, preferences.theme, systemDark])
  useEffect(() => {
    // 同步翻译实例和文档 lang，使已有通知、界面文字及辅助技术一起切换语言。
    const language = resolveLanguage(preferences.language, systemLocale)
    void i18n.changeLanguage(language)
    document.documentElement.lang = language
  }, [preferences.language, systemLocale, i18n])
  useEffect(() => {
    const root = document.documentElement
    root.dataset.glass = String(preferences.glassEnabled)
    root.style.setProperty('--glass-strength', String(preferences.glassIntensity / 100))
  }, [preferences.glassEnabled, preferences.glassIntensity])
  if (!ready) return <div className="startup" role="status">{t('loading')}</div>
  return <TooltipProvider delayDuration={700} skipDelayDuration={0}>{children}<ToastHost /></TooltipProvider>
}
