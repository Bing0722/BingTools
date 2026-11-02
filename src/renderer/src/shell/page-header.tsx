/**
 * 统一标题栏：展示页面名和全局操作，平台按钮留白与可拖拽区域由样式负责。
 */
import { UpdateTrigger } from '@/features/updater/update-trigger'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { NotificationCenter } from '@/features/notifications/notification-center'
export function PageHeader({ title, toggle, collapsed }: { title: string; toggle: () => void; collapsed: boolean }) {
  const { t } = useTranslation()
  return <header className="page-header"><Tooltip label={t(collapsed ? 'expandSidebar' : 'collapseSidebar')}><Button variant="ghost" size="icon" className="sidebar-toggle" data-collapsed={collapsed} onClick={toggle} aria-label={t('toggleSidebar')} aria-expanded={!collapsed}><svg className="sidebar-toggle-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect className="sidebar-toggle-pane" x="3" y="4" width="6" height="16" rx="2" /><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path className="sidebar-toggle-arrow" d="m16 9-3 3 3 3" /></svg></Button></Tooltip><span className="header-title">{title}</span><div className="header-actions"><UpdateTrigger /><NotificationCenter /></div></header>
}
