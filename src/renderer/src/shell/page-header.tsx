import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
export function PageHeader({ title, toggle, collapsed }: { title: string; toggle: () => void; collapsed: boolean }) {
  return <header className="page-header">
    <Tooltip label={collapsed ? '展开侧栏' : '折叠侧栏'}><Button variant="ghost" size="icon" onClick={toggle} aria-label="切换侧栏" aria-expanded={!collapsed}><PanelLeft size={18} /></Button></Tooltip>
    <span className="header-divider" />
    <span className="header-title">{title}</span>
    <span className="header-label">个人工作空间</span>
  </header>
}
