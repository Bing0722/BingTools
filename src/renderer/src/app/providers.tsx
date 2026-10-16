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
  useEffect(() => connectSimulator(), [])
  useEffect(() => connectMotion(), [])
  useEffect(() => connectUpdates(), [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark))
    document.documentElement.style.colorScheme = preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme
  }, [preferences.theme, systemDark])
  useEffect(() => {
    const language = resolveLanguage(preferences.language, systemLocale)
    void i18n.changeLanguage(language)
    document.documentElement.lang = language
  }, [preferences.language, systemLocale, i18n])
  if (!ready) return <div className="startup" role="status">{t('loading')}</div>
  return <TooltipProvider delayDuration={300}>{children}<ToastHost /></TooltipProvider>
}
