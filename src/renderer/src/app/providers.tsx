import { useEffect, type ReactNode } from 'react'
import { useSettings } from '@/stores/settings-store'
import { useMedia } from '@/lib/use-media'
import { TooltipProvider } from '@/components/ui/tooltip'

export function Providers({ children }: { children: ReactNode }) {
  const theme = useSettings((state) => state.preferences.theme)
  const ready = useSettings((state) => state.ready)
  const load = useSettings((state) => state.load)
  const systemDark = useMedia('(prefers-color-scheme: dark)')
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark))
    document.documentElement.style.colorScheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  }, [theme, systemDark])
  if (!ready) return <div className="startup" role="status">正在打开工作台…</div>
  return <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
}
