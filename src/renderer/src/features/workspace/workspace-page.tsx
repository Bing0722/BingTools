import { ArrowRight, ArrowUpRight, Bookmark, Check, FileText, FolderClosed, LayoutGrid, PanelLeft, Settings2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { examples } from '@/features/examples/data'

export function WorkspacePage() {
  return <div className="page-container workspace-page">
    <div className="eyebrow"><span className="status-dot" />你的桌面，井然有序</div>
    <section className="welcome"><h1>留一点空间，<br /><span>给真正重要的事。</span></h1><p>从一个工作区开始，把工具、想法和日常放在一起。</p>
      <div className="welcome-actions"><Button asChild><Link to="/examples/list"><LayoutGrid size={16} />探索示例空间<ArrowRight size={15} /></Link></Button><Button asChild variant="ghost"><Link to="/settings">个性化设置<ArrowUpRight size={15} /></Link></Button></div>
      <div className="workspace-art" aria-hidden="true"><div className="art-window art-back" /><div className="art-window art-front"><div className="art-sidebar"><span /><span /><span /></div><div className="art-main"><div className="art-glyph"><Sparkles size={25} strokeWidth={1.4} /></div><i /><i /><div className="art-cards"><b /><b /></div></div></div><div className="art-badge"><Check size={13} />各就其位</div></div>
    </section>
    <section className="workspace-section"><div className="section-heading"><div><h2>从这里开始</h2><p>三个示例，看看你的工作台可以是什么样。</p></div><span className="badge">演示内容</span></div>
      <div className="starter-grid">{examples.map((item, index) => {
        const Icon = [FolderClosed, FileText, Bookmark][index]
        return <Link className="starter-card" to={`/examples/detail/${item.id}`} key={item.id}><div className="card-top"><span className={`card-icon tone-${index}`}><Icon size={21} strokeWidth={1.6} /></span><ArrowUpRight size={16} className="card-arrow" /></div><h3>{item.title}</h3><p>{item.description}</p><span className="card-category">{item.category}</span></Link>
      })}</div>
    </section>
    <section className="workspace-section recent-section"><div className="section-heading"><h2>示例项目</h2><Link className="text-link" to="/examples/list">查看全部<ArrowRight size={14} /></Link></div><div className="recent-list">{examples.slice(0, 2).map((item) => <Link to={`/examples/detail/${item.id}`} key={item.id} className="recent-row"><FileText size={17} /><div><strong>{item.title}</strong><span>{item.category} · 仅用于布局预览</span></div><span className="recent-date">演示</span><ArrowUpRight size={15} /></Link>)}</div></section>
    <div className="workspace-footer"><span><span className="status-dot" />准备就绪，按你的节奏开始</span><div><PanelLeft size={13} />切换侧栏<kbd>{window.app.platform === 'darwin' ? '⌘' : 'Ctrl'} B</kbd><Link to="/settings" aria-label="打开设置"><Settings2 size={14} /></Link></div></div>
  </div>
}
