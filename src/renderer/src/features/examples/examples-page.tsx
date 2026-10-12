import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, FileText, Inbox, Search, TriangleAlert } from 'lucide-react'
import { examples } from './data'
import { Button } from '@/components/ui/button'

let savedQuery = ''
let savedMode = 'normal'
export function ExamplesPage() {
  const [query, setQuery] = useState(savedQuery)
  const [mode, setMode] = useState(savedMode)
  const filtered = examples.filter((item) => `${item.title}${item.category}`.includes(query))
  function changeMode(value: string) { setMode(value); savedMode = value }
  return <div className="page-container"><div className="page-intro"><div className="eyebrow">EXPLORE YOUR SPACE</div><h1>示例空间<span className="badge">演示</span></h1><p>一个统一的列表入口，用来承载未来的工具和项目。</p></div>
    <div className="list-toolbar"><label className="search-field"><Search size={16} /><input aria-label="搜索示例" placeholder="搜索示例项目…" value={query} onChange={(event) => { setQuery(event.target.value); savedQuery = event.target.value }} /></label><label className="state-select">预览状态<select aria-label="预览状态" value={mode} onChange={(event) => changeMode(event.target.value)}><option value="normal">正常</option><option value="loading">加载中</option><option value="empty">空白</option><option value="error">失败</option></select></label></div>
    {mode === 'loading' ? <div className="skeleton-list" role="status" aria-label="正在加载演示"><span className="muted">加载状态演示，可通过上方选择器切换。</span>{[1, 2, 3].map((key) => <div className="skeleton" key={key} />)}</div> : mode === 'error' ? <div className="empty-state" role="alert"><TriangleAlert size={32} /><h2>暂时无法加载</h2><p>这是错误状态演示，重试会返回正常列表。</p><Button variant="outline" onClick={() => changeMode('normal')}>重试</Button></div> : mode === 'empty' || !filtered.length ? <div className="empty-state"><Inbox size={32} /><h2>{query && mode !== 'empty' ? '没有匹配的示例' : '这里还没有内容'}</h2><p>试试其他关键词，或返回示例列表。</p><Button variant="outline" onClick={() => { setQuery(''); savedQuery = ''; changeMode('normal') }}>显示所有示例</Button></div> : <div className="project-list"><div className="list-labels"><span>名称</span><span>类型</span><span>状态</span></div>{filtered.map((item) => <Link className="project-row" to={`/examples/detail/${item.id}`} key={item.id}><span className="project-name"><span className="file-icon"><FileText size={19} /></span><span><strong>{item.title}</strong><small>{item.description}</small></span></span><span className="muted">{item.category}</span><span className="project-status">{item.status}<ArrowUpRight size={14} /></span></Link>)}</div>}
    <p className="page-footnote">这些内容仅用于展示界面结构，不会创建真实文件。</p>
  </div>
}
