import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Pause, Play, Search, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useSimulator } from '@/stores/simulator-store'
import type { LogEntry } from '../../../../shared/contracts/simulator'
export function LogPanel({ customerId }: { customerId: string | null }) {
  const { t, i18n } = useTranslation()
  const { snapshot, run, busy } = useSimulator()
  const [collapsed, setCollapsed] = useState(false)
  const [paused, setPaused] = useState(false)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const [detail, setDetail] = useState<LogEntry | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const selectedButton = useRef<HTMLElement | null>(null)
  const formatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hour12: false }), [i18n.language])
  const logs = snapshot.logs.filter((entry) => (!customerId || entry.customerId === customerId) &&
    (level === 'all' || level === entry.level) && `${entry.method ?? ''} ${entry.path ?? ''} ${entry.status ?? ''} ${t(entry.code)} ${entry.customerName}`.toLowerCase().includes(query.toLowerCase()))
  useEffect(() => {
    if (!paused && list.current) list.current.scrollTop = list.current.scrollHeight
  }, [snapshot.logs, paused, collapsed])
  return <section className={`log-panel ${collapsed ? 'collapsed' : ''}`} aria-label={t('logs')} onTransitionEnd={(event) => {
    if (event.target === event.currentTarget && event.propertyName === 'height' && !collapsed && !paused && list.current) list.current.scrollTop = list.current.scrollHeight
  }}>
    <div className="log-toolbar"><button className="log-heading" onClick={() => setCollapsed(!collapsed)} aria-label={t(collapsed ? 'expandLogs' : 'collapseLogs')} aria-expanded={!collapsed}><ChevronDown className="log-chevron" size={15} /><strong>{t('logs')}</strong><span className="badge">{logs.length}</span></button><span className="log-limit">{t('logLimit')}</span>
      <div className="log-controls" inert={collapsed} aria-hidden={collapsed}><label className="log-search"><Search size={13} /><input aria-label={t('logSearch')} placeholder={t('logSearch')} value={query} onChange={(event) => setQuery(event.target.value)} /></label><select aria-label={t('logLevel')} value={level} onChange={(event) => setLevel(event.target.value)}>{['all','info','warn','error'].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select><Button variant="ghost" size="icon" aria-label={t(paused ? 'resumeScroll' : 'pauseScroll')} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={14} /> : <Pause size={14} />}</Button><Button aria-disabled={busy} variant="ghost" size="icon" aria-label={t('clearLogs')} onClick={() => void run(() => window.app.simulator.clearLogs(customerId))}><Trash2 size={14} /></Button></div>
    </div>
    <div className="log-entries" inert={collapsed} aria-hidden={collapsed} ref={list} role="region" aria-label={t('logs')} tabIndex={0}>{!logs.length && <div className="log-empty">{t('noLogs')}</div>}{logs.map((entry) => <button className={`log-entry level-${entry.level}`} key={entry.id} onClick={(event) => { selectedButton.current = event.currentTarget; setDetail(entry) }}><time>{formatter.format(entry.time)}</time><span className="log-level">{t(entry.level)}</span><span className="log-message">{entry.method && <b>{entry.method} </b>}{entry.path ?? t(entry.code)}</span><span className="log-status">{entry.status ?? ''}</span><span className="log-duration">{entry.duration !== undefined ? `${entry.duration} ms` : ''}</span></button>)}</div>
    <Dialog open={!!detail} onOpenChange={(open) => { if (!open) { setDetail(null); requestAnimationFrame(() => selectedButton.current?.focus()) } }} title={t('logDetails')} description={detail ? `${detail.customerName} · ${formatter.format(detail.time)} · ${t(detail.code)}` : ''}>
      {detail && <div className="log-detail"><p><strong>{detail.method} {detail.path}</strong> {detail.status} {detail.duration !== undefined && `· ${detail.duration} ms`}</p>{detail.requestHeaders && <><h3>{t('requestHeaders')}</h3><pre>{JSON.stringify(detail.requestHeaders, null, 2)}</pre></>}{detail.requestPreview !== undefined && <><h3>{t('requestBody')} {detail.requestTruncated && <small>{t('truncated')}</small>}</h3><pre>{detail.requestPreview || '—'}</pre></>}{detail.responsePreview !== undefined && <><h3>{t('responsePreview')} {detail.responseTruncated && <small>{t('truncated')}</small>}</h3><pre>{detail.responsePreview || '—'}</pre></>}</div>}
    </Dialog>
  </section>
}
