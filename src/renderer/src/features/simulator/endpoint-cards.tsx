import { useLayoutEffect, useRef, useState } from 'react'
import { FileJson, GripVertical, Pencil, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useMedia } from '@/lib/use-media'
import type { Endpoint } from '../../../../shared/schemas/simulator'

export function EndpointCards({ endpoints, busy, pendingToggle, onAdd, onEdit, onToggle, onReorder }: {
  endpoints: Endpoint[]; busy: boolean; pendingToggle?: string
  onAdd: () => void; onEdit: (entry: Endpoint) => void; onToggle: (entry: Endpoint) => void
  onReorder: (ids: string[]) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const [preview, setPreview] = useState<string[] | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const grid = useRef<HTMLDivElement>(null)
  const positions = useRef(new Map<string, DOMRect>())
  const saving = useRef(false)
  const cards = preview ? preview.map((id) => endpoints.find((entry) => entry.id === id)).filter((entry): entry is Endpoint => !!entry) : endpoints
  const order = cards.map((entry) => entry.id).join(',')
  // FLIP 只在排列变化时运行，日志和开关快照不会重复触发卡片入场。
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>()
    const animations: Animation[] = []
    grid.current?.querySelectorAll<HTMLElement>('[data-endpoint-id]').forEach((element) => {
      const id = element.dataset.endpointId!
      const rect = element.getBoundingClientRect()
      const previous = positions.current.get(id)
      next.set(id, rect)
      if (!reduced && previous && (previous.x !== rect.x || previous.y !== rect.y)) {
        animations.push(element.animate([
          { transform: `translate(${previous.x - rect.x}px, ${previous.y - rect.y}px)` },
          { transform: 'translate(0, 0)' },
        ], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' }))
      }
    })
    positions.current = next
    return () => animations.forEach((animation) => animation.cancel())
  }, [order, reduced])

  async function move(id: string, targetId: string) {
    if (busy || saving.current || id === targetId) return
    const ids = endpoints.map((entry) => entry.id)
    const from = ids.indexOf(id), to = ids.indexOf(targetId)
    if (from < 0 || to < 0) return
    ids.splice(from, 1); ids.splice(to, 0, id)
    // 排序前重新测量，兼容窗口缩放、滚动以及侧栏宽度改变。
    grid.current?.querySelectorAll<HTMLElement>('[data-endpoint-id]').forEach((element) => positions.current.set(element.dataset.endpointId!, element.getBoundingClientRect()))
    saving.current = true
    setPreview(ids)
    try {
      const saved = await onReorder(ids)
      setAnnouncement(t(saved ? 'endpointOrderSaved' : 'SAVE_FAILED'))
    } finally {
      // 权威配置来自主进程；保存失败自动回到原顺序并动画复位。
      setPreview(null)
      saving.current = false
    }
  }
  function cancelDrag() { setDragged(null); setOver(null) }
  return <section className="endpoint-board" aria-label={t('endpoints')}>
    <div className="endpoint-board-header"><div><h2>{t('endpoints')} <span className="badge">{endpoints.length}</span></h2><p>{t('endpointCardsHelp')}</p></div><Button onClick={onAdd} disabled={busy}><Plus size={15} />{t('addEndpoint')}</Button></div>
    <div className="endpoint-grid" ref={grid}>
      {!cards.length && <div className="empty-state"><FileJson size={32} /><h2>{t('noEndpoints')}</h2><p>{t('noEndpointsHelp')}</p></div>}
      {cards.map((entry, index) => <article data-endpoint-id={entry.id} key={entry.id} className={`endpoint-card ${dragged === entry.id ? 'is-dragging' : ''} ${over === entry.id && dragged !== entry.id ? 'is-drop-target' : ''}`}
        onDragOver={(event) => { if (dragged && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(entry.id) } }}
        onDrop={(event) => { event.preventDefault(); if (dragged) void move(dragged, entry.id); cancelDrag() }}>
        <div className="endpoint-card-top"><span className={`method method-${entry.method.toLowerCase()}`}>{entry.method}</span><span className="badge">{entry.format === 'json' ? 'JSON' : t('text')} · {entry.status}</span>
          <button type="button" className="card-grip" draggable={!busy && !preview} aria-disabled={busy} aria-label={t('moveEndpoint', { name: entry.name })} title={t('endpointCardsHelp')}
            onDragStart={(event) => {
              if (busy || saving.current) { event.preventDefault(); return }
              setDragged(entry.id)
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', entry.id)
              const card = event.currentTarget.closest<HTMLElement>('.endpoint-card')
              if (card) event.dataTransfer.setDragImage(card, 24, 24)
            }} onDragEnd={cancelDrag}
            onKeyDown={(event) => {
              if (event.key === 'Escape') { cancelDrag(); return }
              if (!['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) return
              event.preventDefault()
              const target = cards[index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1)]
              if (target) void move(entry.id, target.id)
            }}><GripVertical size={17} /></button></div>
        <button className="endpoint-card-open" onClick={() => onEdit(entry)} aria-label={t('editEndpointNamed', { name: entry.name })}><strong>{entry.name}</strong><code>{entry.path}</code></button>
        <div className="endpoint-card-footer"><button className="switch" role="switch" aria-disabled={busy} aria-busy={pendingToggle === entry.id} aria-label={t('enableEndpoint', { name: entry.name })} aria-checked={entry.enabled} onClick={() => { if (!busy && !saving.current) onToggle(entry) }}><span /></button><span>{t(entry.enabled ? 'enabled' : 'endpointDisabled')}</span><Button variant="ghost" size="sm" onClick={() => onEdit(entry)}><Pencil size={13} />{t('edit')}</Button></div>
      </article>)}
    </div>
    <div className="endpoint-board-footer">{t('activeCount', { count: endpoints.filter((entry) => entry.enabled).length })}<span role="status" aria-live="polite">{announcement}</span></div>
  </section>
}
