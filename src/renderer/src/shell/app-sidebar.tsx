import { Layers3, Server, Settings2 } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/tooltip'
export function AppSidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label={t('navigation')}>
    <div className="sidebar-brand"><div className="brand-icon"><Layers3 size={19} /></div>{!collapsed && <><strong>BingTools</strong><span className="version-tag">0.2</span></>}</div>
    <nav className="primary-nav" aria-label={t('navigation')}><Tooltip label={t('simulator')}><NavLink to="/simulator" aria-label={t('simulator')} className={`nav-item ${pathname === '/simulator' ? 'active' : ''}`} onClick={onNavigate}><Server size={17} /><span>{t('simulator')}</span></NavLink></Tooltip></nav>
    <div className="sidebar-scroll">{!collapsed && <div className="sidebar-note">HTTP MOCK<p>{t('localWorkspace')}</p></div>}</div>
    <div className="sidebar-footer"><Tooltip label={t('settings')}><NavLink to="/settings" aria-label={t('settings')} className={`nav-item ${pathname === '/settings' ? 'active' : ''}`} onClick={onNavigate}><Settings2 size={17} /><span>{t('settings')}</span></NavLink></Tooltip>{!collapsed && <div className="build-label">BingTools<span>v0.2.0</span></div>}</div>
  </aside>
}
