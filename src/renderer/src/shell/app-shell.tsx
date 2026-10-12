import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppSidebar } from './app-sidebar'
import { PageHeader } from './page-header'
import { useSettings } from '@/stores/settings-store'
import { useMedia } from '@/lib/use-media'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

const scrollPositions = new Map<string, number>()
export function AppShell() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const narrow = useMedia('(max-width: 959px)')
  const [overlay, setOverlay] = useState(false)
  const { preferences, update, error, warning, load } = useSettings()
  const scroll = useRef<HTMLElement>(null)
  const collapsed = narrow || preferences.sidebarCollapsed
  const title = pathname.startsWith('/settings') ? '设置' : pathname.startsWith('/examples/detail') ? '项目详情' : pathname.startsWith('/examples') ? '示例空间' : '工作台'
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

  return <div className={`app-shell ${window.app.platform === 'darwin' ? 'platform-mac' : ''}`} style={{ '--sidebar-width': `${collapsed ? 56 : preferences.sidebarWidth}px` } as React.CSSProperties}>
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <AppSidebar collapsed={collapsed} onNavigate={() => setOverlay(false)} />
    <section className="main-panel"><PageHeader title={title} collapsed={collapsed} toggle={toggle} />
      {(error || warning) && <div className="notice" role={error ? 'alert' : 'status'}><span>{error || warning}</span>{error && <Button variant="ghost" size="sm" onClick={() => void load()}>重新读取</Button>}</div>}
      <main id="main-content" ref={scroll} className="page-scroll" tabIndex={-1} aria-label={title}><Outlet /></main>
    </section>
    <Dialog open={narrow && overlay} onOpenChange={setOverlay} title="导航" description="选择要打开的页面。"><div className="mobile-nav"><AppSidebar collapsed={false} onNavigate={() => setOverlay(false)} /></div></Dialog>
  </div>
}
