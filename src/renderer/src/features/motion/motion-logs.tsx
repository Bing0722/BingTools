import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Pause, Play, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMotion } from '@/stores/motion-store'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { MotionLog } from '../../../../shared/schemas/motion'
export function MotionLogs({ customerId }: { customerId: string | null }) {
  const { t, i18n } = useTranslation()
  const entries = useMotion((s) => s.logs)
  const [collapsed, setCollapsed] = useState(false), [paused, setPaused] = useState(false)
  const [query, setQuery] = useState(''), [direction, setDirection] = useState('all')
  const [detail, setDetail] = useState<MotionLog | null>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 200 })
  const list = useRef<HTMLDivElement>(null)
  const formatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }), [i18n.language])
  const logs = useMemo(() => entries.filter((v) => (!customerId || v.customerId === customerId) && (direction === 'all' || direction === v.direction) && `${v.text} ${v.hex} ${v.ruleName ?? ''} ${t(v.code)}`.toLowerCase().includes(query.toLowerCase())), [entries, customerId, direction, query, t])
  useEffect(() => {
    const element = list.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewport({ top: element.scrollTop, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!paused && !collapsed && list.current) {
      list.current.scrollTop = list.current.scrollHeight
      setViewport({ top: list.current.scrollTop, height: list.current.clientHeight })
    }
  }, [logs, paused, collapsed])
  // 固定行高虚拟列表只挂载可见区域及缓冲行，历史增长不会增加 DOM 数量。
  const rowHeight = 32
  const start = Math.max(0, Math.min(Math.floor(viewport.top / rowHeight) - 5, logs.length - 1))
  const visible = logs.slice(start, start + Math.ceil(viewport.height / rowHeight) + 10)
  return <section className={`log-panel ${collapsed ? 'collapsed' : ''}`} aria-label={t('motionLogs')} onTransitionEnd={(event) => {
    if (event.target === event.currentTarget && event.propertyName === 'height' && !collapsed && !paused && list.current) list.current.scrollTop = list.current.scrollHeight
  }}>
    <div className="log-toolbar"><button className="log-heading" aria-label={t(collapsed ? 'expandLogs' : 'collapseLogs')} onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}><ChevronDown size={15} className="log-chevron" /><strong>{t('motionLogs')}</strong><span className="badge">{logs.length}</span></button><span className="log-limit">{t('motionLogLimit')}</span><div className="log-controls" inert={collapsed}><input aria-label={t('logSearch')} placeholder={t('logSearch')} value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label={t('motionDirection')} value={direction} onChange={(e) => setDirection(e.target.value)}>{['all', 'rx', 'tx', 'event'].map((v) => <option key={v} value={v}>{t(v === 'all' ? 'all' : `motion_${v}`)}</option>)}</select><Button variant="ghost" size="icon" aria-label={t(paused ? 'resumeScroll' : 'pauseScroll')} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} /> : <Pause size={14} />}</Button><Button variant="ghost" size="icon" aria-label={t('clearLogs')} onClick={() => void useMotion.getState().run({ type: 'clearLogs', customerId })}><Trash2 size={14} /></Button></div></div>
    <div className="log-entries motion-log-list" ref={list} inert={collapsed} aria-hidden={collapsed} tabIndex={0} role="region" aria-label={t('motionLogs')} onScroll={(e) => setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}>
      {!logs.length && <div className="log-empty">{t('noLogs')}</div>}
      <div style={{ height: logs.length * rowHeight, position: 'relative' }}>{visible.map((entry, index) => <button key={entry.id} className={`log-entry motion-log-entry level-${entry.level}`} style={{ position: 'absolute', top: (start + index) * rowHeight, height: rowHeight, width: '100%' }} onClick={() => setDetail(entry)}><time>{formatter.format(entry.time)}</time><span>{t(`motion_${entry.direction}`)}</span><span className="log-message">{entry.ruleName ? `${entry.ruleName} · ` : ''}{entry.direction === 'event' ? t(entry.code) : entry.text.replace(/[\r\n]/g, ' ') || entry.hex}</span><span>{entry.bytes || ''}</span></button>)}</div>
    </div>
    <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null) }} title={t('logDetails')} description={detail ? `${formatter.format(detail.time)} · ${t(detail.code)} · ${detail.bytes} bytes` : ''}>{detail && <div className="log-detail">{detail.truncated && <p>{t('truncated')}</p>}<h3>{t('text')}</h3><pre>{detail.text || '—'}</pre><h3>HEX</h3><pre>{detail.hex || '—'}</pre></div>}</Dialog>
  </section>
}
