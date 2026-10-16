import { PanelLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { NotificationCenter } from '@/features/notifications/notification-center'
export function PageHeader({ title, toggle, collapsed }: { title: string; toggle: () => void; collapsed: boolean }) {
  const { t } = useTranslation()
  return <header className="page-header"><Tooltip label={t(collapsed ? 'expandSidebar' : 'collapseSidebar')}><Button variant="ghost" size="icon" onClick={toggle} aria-label={t('toggleSidebar')} aria-expanded={!collapsed}><PanelLeft size={18} /></Button></Tooltip><span className="header-divider" /><span className="header-title">{title}</span><NotificationCenter /></header>
}
