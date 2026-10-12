import { Bookmark, ChevronDown, FileText, FolderClosed, Grid2X2, Layers3, LayoutDashboard, Settings2 } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { examples } from '@/features/examples/data'
import { Tooltip } from '@/components/ui/tooltip'

export function AppSidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(true)
  const { pathname } = useLocation()
  const nav = [
    { path: '/workspace', label: '工作台', icon: LayoutDashboard },
    { path: '/examples', label: '示例空间', icon: Grid2X2 },
  ]
  return <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="应用导航">
    <div className="sidebar-brand"><div className="brand-icon"><Layers3 size={19} /></div>{!collapsed && <><strong>BingTools</strong><span className="version-tag">预览</span></>}</div>
    <nav className="primary-nav" aria-label="主要功能">{nav.map(({ path, label, icon: Icon }) => <Tooltip key={path} label={label}><NavLink aria-label={label} to={path === '/examples' ? '/examples/list' : path} className={`nav-item ${pathname.startsWith(path) ? 'active' : ''}`} onClick={onNavigate}><Icon size={17} /><span>{label}</span></NavLink></Tooltip>)}</nav>
    <div className="sidebar-scroll">{!collapsed && <>
      <button className="nav-group-title" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><ChevronDown size={13} className={expanded ? '' : 'rotate-closed'} />示例项目<span>3</span></button>
      {expanded && <nav aria-label="示例项目">{examples.map((item, index) => {
        const Icon = [FolderClosed, FileText, Bookmark][index]
        return <NavLink key={item.id} to={`/examples/detail/${item.id}`} className={({ isActive }) => `nav-item project-nav ${isActive ? 'active' : ''}`} onClick={onNavigate}><Icon size={16} /><span>{item.title}</span></NavLink>
      })}</nav>}
      <div className="sidebar-note"><span className="status-dot" />本地桌面工作台<p>让工具各就其位。</p></div>
    </>}</div>
    <div className="sidebar-footer"><Tooltip label="设置"><NavLink aria-label="设置" to="/settings" className={`nav-item ${pathname.startsWith('/settings') ? 'active' : ''}`} onClick={onNavigate}><Settings2 size={17} /><span>设置</span></NavLink></Tooltip>{!collapsed && <div className="build-label">BingTools <span>v0.1.0</span></div>}</div>
  </aside>
}
