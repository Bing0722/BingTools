import { useLayoutEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { GripVertical, Pencil, Plus, Send, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useMotion, reloadMotion } from '@/stores/motion-store'
import { useNotifications } from '@/stores/notification-store'
import { useMedia } from '@/lib/use-media'
import { defaultSerial, motionCustomerInputSchema, motionRuleSchema, type MotionCustomer, type MotionRule, type SerialPortInfo } from '../../../../shared/schemas/motion'
import { MotionLogs } from './motion-logs'
type CustomerDraft = Omit<MotionCustomer, 'rules'>
export function MotionPage() {
  const { t } = useTranslation()
  const connectionError = useMotion((s) => s.error)
  const state = useMotion((s) => s.state), ready = useMotion((s) => s.ready), busy = useMotion((s) => s.busy), run = useMotion((s) => s.run)
  const customer = state.config.customers.find((v) => v.id === state.config.selectedCustomerId)
  const locked = ['starting', 'running', 'stopping'].includes(state.phase)
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft | null>(null), [rule, setRule] = useState<MotionRule | null>(null)
  const [original, setOriginal] = useState(''), [source, setSource] = useState(''), [ports, setPorts] = useState<SerialPortInfo[]>([]), [loadingPorts, setLoadingPorts] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false), [deletion, setDeletion] = useState<'customer' | 'rule' | null>(null)
  const [drag, setDrag] = useState<string | null>(null), [target, setTarget] = useState<string | null>(null)
  const grid = useRef<HTMLDivElement>(null), positions = useRef(new Map<string, DOMRect>())
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const dirty = !!(rule || customerDraft) && (JSON.stringify(rule ?? customerDraft) !== original || (!!customerDraft && !!source))
  const blocker = useBlocker(dirty)
  const order = customer?.rules.map((v) => v.id).join(',') ?? ''
  useLayoutEffect(() => {
    const next = new Map<string, DOMRect>(), animations: Animation[] = []
    grid.current?.querySelectorAll<HTMLElement>('[data-rule-id]').forEach((element) => {
      const id = element.dataset.ruleId!, rect = element.getBoundingClientRect(), previous = positions.current.get(id)
      next.set(id, rect)
      if (previous && !reduced && (previous.x !== rect.x || previous.y !== rect.y)) animations.push(element.animate([{ transform: `translate(${previous.x - rect.x}px,${previous.y - rect.y}px)` }, { transform: 'translate(0,0)' }], { duration: 240, easing: 'cubic-bezier(.22,1,.36,1)' }))
    })
    positions.current = next
    return () => animations.forEach((animation) => animation.cancel())
  }, [order, reduced])
  function error(code: string) { useNotifications.getState().push(code, 'error') }
  async function refreshPorts() {
    setLoadingPorts(true)
    try { const result = await window.app.motion.listPorts(); if (result.ok) setPorts(result.data); else error(result.error.code) } catch { error('MOTION_LIST_FAILED') } finally { setLoadingPorts(false) }
  }
  function editCustomer(existing?: MotionCustomer) {
    const value: CustomerDraft = existing ? { id: existing.id, name: existing.name, serial: { ...existing.serial } } : { id: crypto.randomUUID(), name: '', serial: { ...defaultSerial } }
    setCustomerDraft(value); setOriginal(JSON.stringify(value)); setSource(''); void refreshPorts()
  }
  function editRule(existing?: MotionRule) {
    const value: MotionRule = existing ? { ...existing } : { id: crypto.randomUUID(), name: '', enabled: false, format: 'text', receive: '', response: '', appendDelimiter: true }
    setRule(value); setOriginal(JSON.stringify(value))
  }
  function close() { if (busy) return; if (dirty) setConfirmClose(true); else { setRule(null); setCustomerDraft(null) } }
  async function save() {
    if (rule && customer) {
      const parsed = motionRuleSchema.safeParse(rule)
      if (!parsed.success) { error('MOTION_INVALID_PAYLOAD'); return false }
      if (!await run({ type: 'saveRule', customerId: customer.id, rule: parsed.data })) return false
    } else if (customerDraft) {
      const parsed = motionCustomerInputSchema.safeParse(customerDraft)
      if (!parsed.success) { error('INVALID_INPUT'); return false }
      if (!await run({ type: 'saveCustomer', customer: parsed.data, sourceId: source || undefined })) return false
    }
    setRule(null); setCustomerDraft(null); return true
  }
  async function move(id: string, to: string) {
    if (!customer || busy || id === to) return
    const ids = customer.rules.map((v) => v.id), from = ids.indexOf(id), destination = ids.indexOf(to)
    if (from < 0 || destination < 0) return
    grid.current?.querySelectorAll<HTMLElement>('[data-rule-id]').forEach((element) => positions.current.set(element.dataset.ruleId!, element.getBoundingClientRect()))
    ids.splice(from, 1); ids.splice(destination, 0, id)
    await run({ type: 'reorderRules', customerId: customer.id, ids })
  }
  if (!ready) return <div className="startup">{t('loading')}</div>
  if (connectionError === 'CONNECTION_FAILED' && state.revision < 0) return <div className="empty-state"><p>{t('CONNECTION_FAILED')}</p><Button onClick={() => void reloadMotion()}>{t('retry')}</Button></div>
  return <div className="simulator-page motion-page">
    <div className="simulator-top"><div className="simulator-title"><div><h1>{t('motion')}</h1><p>{t('motionHelp')}</p></div><span className={`runtime-badge ${state.phase}`}>{t(state.phase)}</span></div>
      <div className="motion-controls"><label className="field"><span>{t('customer')}</span><select aria-label={t('customer')} value={customer?.id ?? ''} disabled={locked || busy || !customer} onChange={(e) => void run({ type: 'selectCustomer', customerId: e.target.value })}>{!customer && <option value="" disabled>—</option>}{state.config.customers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><Button variant="outline" size="icon" aria-label={t('addCustomer')} disabled={locked || busy} onClick={() => editCustomer()}><Plus size={16} /></Button><Button variant="ghost" aria-label={t('editCustomer')} disabled={!customer || locked || busy} onClick={() => editCustomer(customer)}><Pencil size={14} />{t('editCustomer')}</Button><Button variant="ghost" size="icon" aria-label={t('deleteCustomer')} disabled={!customer || locked || busy} onClick={() => setDeletion('customer')}><Trash2 size={15} /></Button><label className="field"><span>{t('connection')}</span><select disabled aria-label={t('connection')}><option>{t('motionSerial')}</option></select></label><div className="field"><span>{t('motionPort')}</span><strong>{customer?.serial.path || '—'}</strong><small>{customer ? `${customer.serial.baudRate} · ${customer.serial.dataBits}/${t(`motion_${customer.serial.parity}`)}/${customer.serial.stopBits}` : ''}</small></div><Button disabled={!customer || busy} onClick={() => void run(locked || state.phase === 'failed' ? { type: 'stop' } : { type: 'start', customerId: customer!.id })}>{t(locked || state.phase === 'failed' ? 'motionDisconnect' : 'motionConnect')}</Button></div>
    </div>
    <section className="endpoint-board"><div className="endpoint-board-header"><div><h2>{t('endpoints')} <span className="badge">{customer?.rules.length ?? 0}</span></h2><p>{t('motionRuleHelp')}</p></div><Button disabled={!customer || busy} onClick={() => editRule()}><Plus size={15} />{t('addEndpoint')}</Button></div>
      <div className="endpoint-grid" ref={grid}>{!customer?.rules.length && <div className="empty-state"><h2>{t('noEndpoints')}</h2><p>{t('motionEmpty')}</p></div>}{customer?.rules.map((entry, index) => <article key={entry.id} data-rule-id={entry.id} className={`endpoint-card ${drag === entry.id ? 'is-dragging' : ''} ${target === entry.id && drag !== entry.id ? 'is-drop-target' : ''}`} onDragOver={(e) => { if (drag && !busy) { e.preventDefault(); setTarget(entry.id) } }} onDrop={(e) => { e.preventDefault(); if (drag) void move(drag, entry.id); setDrag(null); setTarget(null) }}>
        <div className="endpoint-card-top"><span className="badge">{entry.format.toUpperCase()}</span><button className="card-grip" draggable={!busy} aria-label={t('moveEndpoint', { name: entry.name })} title={t('endpointCardsHelp')} onDragStart={(e) => { setDrag(entry.id); e.dataTransfer.setData('text/plain', entry.id); e.dataTransfer.effectAllowed = 'move' }} onDragEnd={() => { setDrag(null); setTarget(null) }} onKeyDown={(e) => { if (e.key === 'Escape') { setDrag(null); setTarget(null) } if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); const destination = customer.rules[index + (['ArrowLeft','ArrowUp'].includes(e.key) ? -1 : 1)]; if (destination) void move(entry.id, destination.id) } }}><GripVertical size={17} /></button></div>
        <button className="endpoint-card-open" aria-label={t('editEndpointNamed', { name: entry.name })} onClick={() => editRule(entry)}><strong>{entry.name}</strong><code>RX · {entry.receive}</code><code>TX · {entry.response || '—'}</code></button><div className="endpoint-card-footer"><button className="switch" role="switch" aria-label={t('enableEndpoint', { name: entry.name })} aria-checked={entry.enabled} aria-disabled={busy} onClick={() => { if (!busy) void run({ type: 'toggleRule', customerId: customer.id, ruleId: entry.id, enabled: !entry.enabled }) }}><span /></button><span>{t('motionAutoReply')}</span><Button variant="ghost" size="sm" disabled={state.phase !== 'running' || busy} onClick={() => void run({ type: 'sendRule', customerId: customer.id, ruleId: entry.id })}><Send size={14} />{t('motionSend')}</Button></div>
      </article>)}</div><div className="endpoint-board-footer">{t('endpointCardsHelp')}</div></section>
    <MotionLogs customerId={customer?.id ?? null} />
    <Dialog open={!!customerDraft} onOpenChange={(open) => { if (!open) close() }} title={t('motionCustomer')} description={t('motionCustomerHelp')} className="motion-dialog">
      {customerDraft && <div className="motion-form" inert={busy}><label className="field"><span>{t('customerName')}</span><input aria-label={t('customerName')} value={customerDraft.name} onChange={(e) => setCustomerDraft({ ...customerDraft, name: e.target.value })} /></label>
        {!state.config.customers.some((v) => v.id === customerDraft.id) && <label className="field"><span>{t('motionCopy')}</span><select aria-label={t('motionCopy')} value={source} onChange={(e) => { setSource(e.target.value); const sourceCustomer = state.config.customers.find((v) => v.id === e.target.value); setCustomerDraft({ ...customerDraft, serial: { ...(sourceCustomer?.serial ?? defaultSerial) } }) }}><option value="">{t('motionNoCopy')}</option>{state.config.customers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
        <div className="motion-form-row"><label className="field"><span>{t('motionPort')}</span><select aria-label={t('motionPort')} value={customerDraft.serial.path} onChange={(e) => setCustomerDraft({ ...customerDraft, serial: { ...customerDraft.serial, path: e.target.value } })}><option value="">{t('motionChoosePort')}</option>{customerDraft.serial.path && !ports.some((v) => v.path === customerDraft.serial.path) && <option value={customerDraft.serial.path}>{customerDraft.serial.path} · {t('motionUnavailable')}</option>}{ports.map((v) => <option key={v.path} value={v.path}>{v.path}{v.manufacturer ? ` · ${v.manufacturer}` : ''}</option>)}</select></label><Button variant="outline" disabled={loadingPorts} onClick={() => void refreshPorts()}>{t('motionRefresh')}</Button></div>
        <div className="motion-form-row">{(['baudRate','dataBits','stopBits','parity','framing'] as const).map((key) => <label className="field" key={key}><span>{t(`motion_${key}`)}</span>{key === 'baudRate' ? <input type="number" aria-label={t(`motion_${key}`)} value={customerDraft.serial[key]} onChange={(e) => setCustomerDraft({ ...customerDraft, serial: { ...customerDraft.serial, baudRate: Number(e.target.value) } })} /> : <select aria-label={t(`motion_${key}`)} value={customerDraft.serial[key]} onChange={(e) => setCustomerDraft({ ...customerDraft, serial: { ...customerDraft.serial, [key]: ['dataBits','stopBits'].includes(key) ? Number(e.target.value) : e.target.value } })}>{(key === 'dataBits' ? [5,6,7,8] : key === 'stopBits' ? [1,1.5,2] : key === 'parity' ? ['none','even','odd','mark','space'] : ['delimiter','length','idle']).map((v) => <option key={v} value={v}>{typeof v === 'number' ? v : t(`motion_${v}`)}</option>)}</select>}</label>)}</div>
        <label className="field"><span>{t('motionDelimiter')}</span><input aria-label={t('motionDelimiter')} value={customerDraft.serial.delimiter} onChange={(e) => setCustomerDraft({ ...customerDraft, serial: { ...customerDraft.serial, delimiter: e.target.value.replace(/\s/g, '') } })} /></label>
        {customerDraft.serial.framing !== 'delimiter' && <label className="field"><span>{t(customerDraft.serial.framing === 'length' ? 'motionFrameLength' : 'motionIdleMs')}</span><input type="number" aria-label={t(customerDraft.serial.framing === 'length' ? 'motionFrameLength' : 'motionIdleMs')} value={customerDraft.serial.framing === 'length' ? customerDraft.serial.frameLength : customerDraft.serial.idleMs} onChange={(e) => setCustomerDraft({ ...customerDraft, serial: { ...customerDraft.serial, [customerDraft.serial.framing === 'length' ? 'frameLength' : 'idleMs']: Number(e.target.value) } })} /></label>}
        <label><input type="checkbox" checked={customerDraft.serial.rtscts} onChange={(e) => setCustomerDraft({ ...customerDraft, serial: { ...customerDraft.serial, rtscts: e.target.checked } })} /> RTS/CTS</label><p className="muted">{t('motionFramingHelp')}</p>
      </div>}<div className="dialog-actions"><Button variant="outline" onClick={close}>{t('cancel')}</Button><Button disabled={busy} onClick={() => void save()}>{t('save')}</Button></div>
    </Dialog>
    <Dialog open={!!rule} onOpenChange={(open) => { if (!open) close() }} title={rule?.name || t('addEndpoint')} description={t('motionRuleDialogHelp')} className="motion-dialog">
      {rule && <div className="motion-form" inert={busy}><label className="field"><span>{t('endpointName')}</span><input aria-label={t('endpointName')} value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} /></label><label className="field"><span>{t('motionFormat')}</span><select aria-label={t('motionFormat')} value={rule.format} onChange={(e) => setRule({ ...rule, format: e.target.value as MotionRule['format'] })}><option value="text">{t('text')} (UTF-8)</option><option value="hex">HEX</option></select></label><label className="field"><span>{t('motionReceive')}</span><textarea aria-label={t('motionReceive')} value={rule.receive} onChange={(e) => setRule({ ...rule, receive: e.target.value })} /></label><label className="field"><span>{t('motionResponse')}</span><textarea aria-label={t('motionResponse')} value={rule.response} onChange={(e) => setRule({ ...rule, response: e.target.value })} /></label><label><input type="checkbox" checked={rule.appendDelimiter} onChange={(e) => setRule({ ...rule, appendDelimiter: e.target.checked })} /> {t('motionAppend')}</label><label><input type="checkbox" checked={rule.enabled} onChange={(e) => setRule({ ...rule, enabled: e.target.checked })} /> {t('motionAutoReply')}</label></div>}
      <div className="dialog-actions"><Button variant="ghost" disabled={busy || !customer?.rules.some((v) => v.id === rule?.id)} onClick={() => setDeletion('rule')}>{t('deleteEndpoint')}</Button><Button variant="outline" onClick={close}>{t('close')}</Button><Button disabled={busy || !dirty} onClick={() => void save()}>{t('saveEndpoint')}</Button></div>
    </Dialog>
    <Dialog open={confirmClose || blocker.state === 'blocked'} onOpenChange={(open) => { if (!open) { setConfirmClose(false); if (blocker.state === 'blocked') blocker.reset() } }} title={t('unsavedTitle')} description={t('unsavedHelp')}><div className="dialog-actions"><Button variant="outline" onClick={() => { setConfirmClose(false); if (blocker.state === 'blocked') blocker.reset() }}>{t('cancel')}</Button><Button variant="outline" onClick={() => { setRule(null); setCustomerDraft(null); setConfirmClose(false); if (blocker.state === 'blocked') blocker.proceed() }}>{t('discard')}</Button><Button disabled={busy} onClick={async () => { if (await save()) { setConfirmClose(false); if (blocker.state === 'blocked') blocker.proceed() } }}>{t('save')}</Button></div></Dialog>
    <Dialog open={!!deletion} onOpenChange={(open) => { if (!open) setDeletion(null) }} title={t(deletion === 'customer' ? 'deleteCustomer' : 'deleteEndpoint')} description={t('motionDeleteHelp')}><div className="dialog-actions"><Button variant="outline" onClick={() => setDeletion(null)}>{t('cancel')}</Button><Button disabled={busy} onClick={async () => { if (!customer) return; if (await run(deletion === 'customer' ? { type: 'deleteCustomer', customerId: customer.id } : { type: 'deleteRule', customerId: customer.id, ruleId: rule!.id })) { setDeletion(null); setRule(null) } }}>{t('delete')}</Button></div></Dialog>
  </div>
}
