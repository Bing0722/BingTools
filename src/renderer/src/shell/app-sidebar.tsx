/**
 * 侧栏导航：选中项由当前路由决定，常驻标记跟随实际导航项位置移动。
 */
import { useLayoutEffect, useRef } from 'react'
import { ThemeShortcut } from './theme-shortcut'
import { Layers3, Server, Settings2, Cable } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/tooltip'
export function AppSidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const sidebar = useRef<HTMLElement>(null)
  const marker = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const container = sidebar.current, indicator = marker.current
    if (!container || !indicator) return
    let frame = 0
    function position() {
      const active = container!.querySelector<HTMLElement>('.nav-item.active')
      if (!active) return
      const rect = active.getBoundingClientRect(), parent = container!.getBoundingClientRect()
      indicator!.style.transform = `translateY(${rect.top - parent.top}px)`
      indicator!.style.height = `${rect.height}px`
    }
    // 首帧先定位再启用过渡，避免选中背景从默认位置飞入；尺寸变化时重新测量。
    position()
    frame = requestAnimationFrame(() => indicator.classList.add('is-ready'))
    const observer = new ResizeObserver(position)
    observer.observe(container)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [pathname, collapsed])
  return <aside ref={sidebar} className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label={t('navigation')}>
    <div ref={marker} className="nav-selection" aria-hidden="true" />
    <div className="sidebar-brand"><div className="brand-icon"><Layers3 size={19} /></div><div className="brand-copy" aria-hidden={collapsed}><strong>BingTools</strong><span className="version-tag">{__APP_VERSION__}</span></div></div>
    <nav className="primary-nav" aria-label={t('navigation')}><Tooltip disabled={!collapsed} side="right" label={t('simulator')}><NavLink to="/simulator" aria-label={t('simulator')} className={`nav-item ${pathname === '/simulator' ? 'active' : ''}`} onClick={onNavigate}><Server size={17} /><span>{t('simulator')}</span></NavLink></Tooltip><Tooltip disabled={!collapsed} side="right" label={t('motion')}><NavLink to="/motion" aria-label={t('motion')} className={`nav-item ${pathname === '/motion' ? 'active' : ''}`} onClick={onNavigate}><Cable size={17} /><span>{t('motion')}</span></NavLink></Tooltip></nav>
    <div className="sidebar-spacer" aria-hidden="true" />
    <div className="sidebar-footer"><ThemeShortcut collapsed={collapsed} /><Tooltip disabled={!collapsed} side="right" label={t('settings')}><NavLink to="/settings" aria-label={t('settings')} className={`nav-item ${pathname === '/settings' ? 'active' : ''}`} onClick={onNavigate}><Settings2 size={17} /><span>{t('settings')}</span></NavLink></Tooltip></div>
  </aside>
}
