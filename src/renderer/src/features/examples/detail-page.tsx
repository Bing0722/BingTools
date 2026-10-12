import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, FileText, MoreHorizontal, Info } from 'lucide-react'
import { examples } from './data'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { DropdownMenu, DropdownItem } from '@/components/ui/dropdown-menu'

export function DetailPage() {
  const { id } = useParams()
  const item = examples.find((entry) => entry.id === id)
  const [info, setInfo] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const navigate = useNavigate()
  if (!item) return <NotFoundPage />
  return <div className="page-container detail-page"><div className="detail-toolbar"><Button asChild variant="ghost" size="sm"><Link to="/examples/list"><ArrowLeft size={15} />返回示例空间</Link></Button><DropdownMenu trigger={<Button ref={menuButton} aria-label="项目操作" variant="ghost" size="icon"><MoreHorizontal size={18} /></Button>}><DropdownItem onSelect={() => setInfo(true)}><Info size={15} />关于这个示例</DropdownItem><DropdownItem onSelect={() => navigate('/settings')}>打开外观设置</DropdownItem></DropdownMenu></div>
    <div className="detail-icon"><FileText size={30} strokeWidth={1.4} /></div><span className="badge">{item.category} · 演示内容</span><h1>{item.title}</h1><p className="detail-description">{item.description}</p>
    <div className="detail-meta"><div><span>内容类型</span><strong>布局示例</strong></div><div><span>当前状态</span><strong>{item.status}</strong></div><div><span>保存方式</span><strong>静态演示</strong></div></div>
    <section className="detail-body"><h2>让每一项工作都有自己的空间</h2><p>这里是详情页面的内容区域。后续可以根据实际功能，放入编辑表单、文件预览、任务详情或工具操作区。</p><p>导航、标题栏与主题由统一框架提供。页面可以专注于内容，在保持一致体验的同时，拥有适合自己的布局。</p><div className="detail-callout"><Info size={19} /><div><strong>这是一个可以探索的雏形</strong><p>试着切换主题、收起侧栏，或者返回列表查看不同页面状态。</p></div></div><Button variant="outline" asChild><Link to="/settings">调整工作台外观<ArrowRight size={15} /></Link></Button></section>
    <Dialog open={info} onOpenChange={(open) => { setInfo(open); if (!open) requestAnimationFrame(() => menuButton.current?.focus()) }} title="关于这个示例" description="此页面用于验证详情布局与通用交互。"><p className="dialog-copy">没有接入真实业务数据，也不会创建文件。应用的主题与侧栏设置已接入本地持久化，可在重启后恢复。</p><div className="dialog-actions"><Button onClick={() => { setInfo(false); menuButton.current?.focus() }}>知道了</Button></div></Dialog>
  </div>
}
export function NotFoundPage() { return <div className="empty-state"><FileText size={32} /><h1>没有找到这个页面</h1><p>这个地址没有对应的内容。</p><Button asChild variant="outline"><Link to="/workspace">返回工作台</Link></Button></div> }
