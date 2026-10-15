import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppSidebar } from './app-sidebar'
import { PageHeader } from './page-header'
import { useSettings } from '@/stores/settings-store'
import { useMedia } from '@/lib/use-media'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@/components/ui/dialog'

const scrollPositions = new Map<string, number>()
export function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const narrow = useMedia('(max-width: 959px)')
  const [overlay, setOverlay] = useState(false)
  const { preferences, update, error, warning, load } = useSettings()
  const scroll = useRef<HTMLElement>(null)
  const collapsed = narrow || preferences.sidebarCollapsed
  const title = t(pathname === '/settings' ? 'settings' : pathname === '/motion' ? 'motion' : 'simulator')
  function toggle() {
    if (narrow) setOverlay((open) => !open)
    else void update({ sidebarCollapsed: !preferences.sidebarCollapsed })
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.isComposing || event.repeat || (!event.metaKey && !event.ctrlKey)) return
      if (event.key.toLowerCase() === 'b') {
        if (event.target instanceof HTMLElement && (event.target.isContentEditable || /INPUT|TEXTAREA/.test(event.target.tagName))) return
        event.preventDefault()
        if (narrow) setOverlay((open) => !open)
        else void update({ sidebarCollapsed: !preferences.sidebarCollapsed })
      }
      if (event.key === ',') { event.preventDefault(); navigate('/settings') }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [narrow, preferences.sidebarCollapsed, update, navigate])
  useLayoutEffect(() => {
    const element = scroll.current
    if (element) element.scrollTop = scrollPositions.get(pathname) ?? 0
    return () => { if (element) scrollPositions.set(pathname, element.scrollTop) }
  }, [pathname])

  return <div className={`app-shell ${window.app.platform === 'darwin' ? 'platform-mac' : window.app.platform === 'win32' ? 'platform-win' : ''}`} style={{ '--sidebar-width': `${collapsed ? 56 : preferences.sidebarWidth}px` } as React.CSSProperties}>
    <button className="skip-link" onClick={() => scroll.current?.focus()}>{t('skipContent')}</button>
    <PageHeader title={title} collapsed={collapsed} toggle={toggle} />
    <AppSidebar collapsed={collapsed} onNavigate={() => setOverlay(false)} />
    <section className="main-panel">
      {(error || warning) && <div className="notice" role={error ? 'alert' : 'status'}><span>{t(error || warning || '')}</span>{error && <Button variant="ghost" size="sm" onClick={() => void load()}>{t('retry')}</Button>}</div>}
      <main key={pathname} id="main-content" ref={scroll} className={`page-scroll ${['/simulator', '/motion'].includes(pathname) ? 'simulator-scroll' : ''}`} tabIndex={-1} aria-label={title}><Outlet /></main>
    </section>
    <Dialog open={narrow && overlay} onOpenChange={setOverlay} title={t('navigation')} description={t('choosePage')}><div className="mobile-nav"><AppSidebar collapsed={false} onNavigate={() => setOverlay(false)} /></div></Dialog>
  </div>
}
