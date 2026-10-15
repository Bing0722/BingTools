import { Layers3, Server, Settings2, Cable } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/tooltip'
export function AppSidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label={t('navigation')}>
    <div className="sidebar-brand"><div className="brand-icon"><Layers3 size={19} /></div><div className="brand-copy" aria-hidden={collapsed}><strong>BingTools</strong><span className="version-tag">{__APP_VERSION__}</span></div></div>
    <nav className="primary-nav" aria-label={t('navigation')}><Tooltip label={t('simulator')}><NavLink to="/simulator" aria-label={t('simulator')} className={`nav-item ${pathname === '/simulator' ? 'active' : ''}`} onClick={onNavigate}><Server size={17} /><span>{t('simulator')}</span></NavLink></Tooltip><Tooltip label={t('motion')}><NavLink to="/motion" aria-label={t('motion')} className={`nav-item ${pathname === '/motion' ? 'active' : ''}`} onClick={onNavigate}><Cable size={17} /><span>{t('motion')}</span></NavLink></Tooltip></nav>
    <div className="sidebar-scroll"><div className="sidebar-note" aria-hidden={collapsed}>HTTP MOCK<p>{t('localWorkspace')}</p></div></div>
    <div className="sidebar-footer"><Tooltip label={t('settings')}><NavLink to="/settings" aria-label={t('settings')} className={`nav-item ${pathname === '/settings' ? 'active' : ''}`} onClick={onNavigate}><Settings2 size={17} /><span>{t('settings')}</span></NavLink></Tooltip><div className="build-label" aria-hidden={collapsed}>BingTools<span>v{__APP_VERSION__}</span></div></div>
  </aside>
}
