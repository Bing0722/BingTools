import { TcpSettings } from './tcp-settings'
import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Circle, Pencil, Play, Plus, Save, Server, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useNotifications } from '@/stores/notification-store'
import { useSimulator } from '@/stores/simulator-store'
import { customerInputSchema, customerNameKey, endpointSchema, methods, type CustomerInput, type Endpoint } from '../../../../shared/schemas/simulator'
import { EndpointCards } from './endpoint-cards'
import { LogPanel } from './log-panel'
import { ResponseBodyEditor } from './response-body-editor'

type Action = () => void | Promise<void>
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
export function SimulatorPage() {
  const { t } = useTranslation()
  const { snapshot, ready, busy: working, pendingToggle, error, run } = useSimulator()
  // 开关仍串行保存，但不让整页进入禁用/变灰状态。
  const busy = working && !pendingToggle
  const customer = snapshot.config.customers.find((entry) => entry.id === snapshot.config.selectedCustomerId)
  const [draft, setDraft] = useState<Endpoint | null>(null)
  const [listener, setListener] = useState({ host: '', port: '' })
  const [pending, setPending] = useState<Action | null>(null)
  const [customerForm, setCustomerForm] = useState<CustomerInput | null>(null)
  const [copySource, setCopySource] = useState('')
  const [deletion, setDeletion] = useState<'customer' | 'endpoint' | null>(null)
  const focusReturn = useRef<HTMLElement | null>(null)
  const locked = ['starting','running','stopping'].includes(snapshot.runtime.phase)
  const persisted = customer?.endpoints.find((entry) => entry.id === draft?.id)
  const endpointDirty = !!draft && !equal(pendingToggle === draft.id && persisted ? { ...draft, enabled: persisted.enabled } : draft, persisted)
  const listenerDirty = !!customer && (listener.host !== customer.host || listener.port !== String(customer.port))
  const dirty = endpointDirty || listenerDirty
  const blocker = useBlocker(dirty)
  const customerId = customer?.id

  useEffect(() => {
    const current = useSimulator.getState().snapshot.config.customers.find((entry) => entry.id === customerId)
    setDraft(null)
    setListener({ host: current?.host ?? '', port: current ? String(current.port) : '' })
  }, [customerId])

  function guard(action: Action) {
    if (useSimulator.getState().busy) return
    if (dirty) { focusReturn.current = document.activeElement as HTMLElement; setPending(() => action) }
    else void action()
  }
  function setField<K extends keyof Endpoint>(key: K, value: Endpoint[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }
  function reportError(code: string) {
    useNotifications.getState().push(code, 'error')
  }
  async function saveChanges(): Promise<boolean> {
    if (!customer) return false
    // 先校验全部草稿，再开始写入，避免基础格式错误导致部分保存。
    const parsed = draft ? endpointSchema.safeParse(draft) : null
    const customerInput = customerInputSchema.safeParse({ id: customer.id, name: customer.name, host: listener.host, port: Number(listener.port), protocol: customer.protocol, tcp: customer.tcp })
    if (endpointDirty && parsed && !parsed.success) {
      const issue = parsed.error.issues[0]
      reportError(['INVALID_JSON','INVALID_PATH','BODY_TOO_LARGE'].includes(issue.message) ? issue.message : issue.path[0] === 'path' ? 'INVALID_PATH' : 'INVALID_INPUT')
      return false
    }
    if (listenerDirty && !customerInput.success) { reportError('INVALID_INPUT'); return false }
    if (listenerDirty && customerInput.success && !await run(() => window.app.simulator.saveCustomer(customerInput.data), 'customerSaved')) return false
    if (endpointDirty && parsed?.success) {
      if (!await run(() => window.app.simulator.saveEndpoint(customer.id, parsed.data), 'endpointSaved')) return false
      setDraft(parsed.data)
    }
    return true
  }
  async function continueNavigation(save: boolean) {
    if (save && !await saveChanges()) return
    if (!save) {
      setDraft(persisted ?? null)
      if (customer) setListener({ host: customer.host, port: String(customer.port) })
    }
    const action = pending
    setPending(null)
    if (blocker.state === 'blocked') blocker.proceed()
    else if (action) await action()
  }
  function cancelNavigation() {
    setPending(null)
    if (blocker.state === 'blocked') blocker.reset()
    requestAnimationFrame(() => focusReturn.current?.focus())
  }
  function closeEndpoint() {
    if (useSimulator.getState().busy) return
    if (endpointDirty) {
      focusReturn.current = document.activeElement as HTMLElement
      setPending(() => () => setDraft(null))
    } else setDraft(null)
  }
  function newEndpoint() {
    guard(() => setDraft({ id: crypto.randomUUID(), name: t('newEndpoint'), path: '/api/example', method: 'GET', format: 'json', status: 200, body: '{\n  "ok": true\n}', enabled: false }))
  }
  function openCustomer(edit: boolean) {
    guard(() => {
      focusReturn.current = document.activeElement as HTMLElement
      setCopySource('')
      setCustomerForm(edit && customer ? { id: customer.id, name: customer.name, host: customer.host, port: customer.port, protocol: customer.protocol, tcp: customer.tcp } : { id: crypto.randomUUID(), name: '', host: '127.0.0.1', port: 8080, protocol: 'http' })
    })
  }
  function closeCustomer() { setCustomerForm(null); requestAnimationFrame(() => focusReturn.current?.focus()) }
  async function saveCustomer() {
    const parsed = customerInputSchema.safeParse(customerForm)
    if (!parsed.success) { reportError('INVALID_INPUT'); return }
    if (snapshot.config.customers.some((entry) => entry.id !== parsed.data.id && customerNameKey(entry.name) === customerNameKey(parsed.data.name))) {
      reportError('DUPLICATE_CUSTOMER_NAME'); return
    }
    if (await run(() => window.app.simulator.saveCustomer(parsed.data, copySource || undefined), 'customerSaved')) {
      setListener({ host: parsed.data.host, port: String(parsed.data.port) })
      closeCustomer()
    }
  }
  async function remove() {
    if (!customer) return
    if (deletion === 'customer') {
      if (await run(() => window.app.simulator.deleteCustomer(customer.id), 'deleted')) { setDraft(null); setDeletion(null) }
    } else if (draft) {
      if (!persisted || await run(() => window.app.simulator.deleteEndpoint(customer.id, draft.id), 'deleted')) { setDraft(null); setDeletion(null) }
    }
  }
  if (!ready) return <div className="startup" role="status">{t('loading')}</div>
  const fullAddress = customer && draft ? `${customer.protocol}://${(listener.host || customer.host).includes(':') ? `[${listener.host || customer.host}]` : listener.host || customer.host}:${listener.port || customer.port}${customer.protocol === 'tcp' ? '' : draft.path}` : ''
  return <div className="simulator-page">
    <div className="simulator-top"><div className="simulator-title"><div><h1>{t('simulator')}</h1><p>{t('manualStart')}</p></div><span className={`runtime-badge phase-${snapshot.runtime.phase}`} role="status"><Circle size={7} fill="currentColor" />{t(snapshot.runtime.phase)}</span></div>
      <div className="server-controls"><label className="field customer-select"><span>{t('customer')}</span><select aria-label={t('customer')} disabled={locked || busy || !customer} value={customer?.id ?? ''} onChange={(event) => { const id = event.target.value; guard(async () => { await run(() => window.app.simulator.selectCustomer(id)) }) }}>{!snapshot.config.customers.length && <option value="" disabled>—</option>}{snapshot.config.customers.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
        <div className="customer-buttons"><Button variant="outline" size="icon" disabled={locked || busy} aria-label={t('addCustomer')} onClick={() => openCustomer(false)}><Plus size={15} /></Button><Button className="customer-edit-button" title={t('editCustomer')} variant="ghost" size="sm" disabled={!customer || locked || busy} aria-label={t('editCustomer')} onClick={() => openCustomer(true)}><Pencil size={14} /><span>{t('editCustomer')}</span></Button><Button variant="ghost" size="icon" disabled={!customer || locked || busy} aria-label={t('deleteCustomer')} onClick={() => guard(() => setDeletion('customer'))}><Trash2 size={14} /></Button></div>
        <label className="field protocol-field"><span>{t('connection')}</span><input readOnly aria-label={t('connection')} value={customer?.protocol === 'tcp' ? 'TCP' : 'WebAPI (HTTP)'} /></label>
        <label className="field host-field"><span>{t('host')}</span><input aria-label={t('host')} disabled={!customer || locked || busy} value={listener.host} placeholder="127.0.0.1" onChange={(event) => setListener({ ...listener, host: event.target.value })} /></label>
        <label className="field port-field"><span>{t('port')}</span><input aria-label={t('port')} type="number" min={1} max={65535} disabled={!customer || locked || busy} value={listener.port} placeholder="8080" onChange={(event) => setListener({ ...listener, port: event.target.value })} /></label>
        {listenerDirty && <Button variant="outline" disabled={busy} onClick={() => void saveChanges()}><Save size={14} />{t('save')}</Button>}
        <Button className="server-action" disabled={!customer || busy} variant={locked ? 'outline' : 'default'} onClick={() => locked ? void run(() => window.app.simulator.stop()) : guard(async () => { if (customer) await run(() => window.app.simulator.start(customer.id)) })}>{locked ? <Square size={14} /> : <Play size={14} />}{t(locked ? 'stop' : 'start')}</Button>
      </div>{locked && <p className="listener-hint">{t('stopToEdit')}</p>}
      {error === 'CONNECTION_FAILED' && <Button variant="ghost" size="sm" onClick={() => void run(() => window.app.simulator.getSnapshot())}>{t('retry')}</Button>}
    </div>
    <div className="simulator-workspace">{!customer ? <div className="empty-state"><Server size={32} /><h2>{t('noCustomers')}</h2><p>{t('noCustomersHelp')}</p><Button onClick={() => openCustomer(false)}><Plus size={15} />{t('addCustomer')}</Button></div> : <>
      <EndpointCards protocol={customer.protocol} key={customer.id} endpoints={customer.endpoints} busy={working} pendingToggle={pendingToggle}
        onAdd={newEndpoint} onEdit={(entry) => guard(() => setDraft(entry))}
        onToggle={(entry) => guard(async () => { await run(() => window.app.simulator.setEndpointEnabled(customer.id, entry.id, !entry.enabled), undefined, entry.id) })}
        onReorder={(ids) => run(() => window.app.simulator.reorderEndpoints(customer.id, ids))} />
    </>}</div>
    <LogPanel customerId={customer?.id ?? null} />
    <Dialog className="endpoint-dialog" open={!!draft} onOpenChange={(open) => { if (!open) closeEndpoint() }} title={draft?.name || t('newEndpoint')} description={t('endpointDialogHelp')}>
      {draft && <div className="endpoint-modal-body">
          <div className="editor-fields" key={draft.id}><label className="field"><span>{t('endpointName')}</span><input aria-label={t('endpointName')} value={draft.name} maxLength={100} onChange={(event) => setField('name', event.target.value)} disabled={busy} /></label>{customer?.protocol !== 'tcp' && <div className="route-fields"><label className="field"><span>{t('method')}</span><select aria-label={t('method')} value={draft.method} onChange={(event) => setField('method', event.target.value as Endpoint['method'])} disabled={busy}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label><label className="field"><span>{t('path')}</span><input aria-label={t('path')} value={draft.path} onChange={(event) => setField('path', event.target.value)} disabled={busy} /></label></div>}<code className="address-preview">{fullAddress}</code><p className="field-hint">{t(customer?.protocol === 'tcp' ? 'tcpEndpointHelp' : 'endpointHelp')}</p>
          <div className="response-fields"><label className="field"><span>{t('format')}</span><select aria-label={t('format')} value={draft.format} onChange={(event) => setField('format', event.target.value as Endpoint['format'])} disabled={busy}><option value="json">JSON</option><option value="text">{t('text')}</option></select></label>{customer?.protocol !== 'tcp' && <label className="field"><span>{t('statusCode')}</span><input aria-label={t('statusCode')} type="number" min={200} max={599} value={draft.status || ''} onChange={(event) => setField('status', Number(event.target.value))} disabled={busy} /></label>}<label className="enabled-field"><span>{t('enabled')}</span><button className="switch" role="switch" aria-label={t('enabled')} aria-checked={draft.enabled} aria-disabled={working} onClick={() => { if (!working) setField('enabled', !draft.enabled) }}><span /></button></label></div>
          <ResponseBodyEditor key={draft.id + draft.format} body={draft.body} format={draft.format} disabled={busy} onChange={(body) => setField('body', body)} /><p className="field-hint">{t(customer?.protocol === 'tcp' ? 'tcpResponseHint' : 'responseHint')}</p></div>
        <div className="editor-footer"><Button variant="ghost" disabled={working} onClick={() => setDeletion('endpoint')}><Trash2 size={15} />{t('deleteEndpoint')}</Button><span className="muted">{t(endpointDirty ? 'unsaved' : 'saved')}</span><Button variant="outline" disabled={working} onClick={closeEndpoint}>{t('close')}</Button><Button disabled={working || !dirty} onClick={() => void saveChanges().then((saved) => { if (saved) setDraft(null) })}><Save size={15} />{t(busy ? 'saving' : 'saveEndpoint')}</Button></div>
      </div>}
    </Dialog>
    <Dialog open={!!pending || blocker.state === 'blocked'} onOpenChange={(open) => { if (!open) cancelNavigation() }} title={t('unsavedTitle')} description={t('unsavedHelp')}>
      <div className="dialog-actions"><Button variant="ghost" disabled={busy} onClick={cancelNavigation}>{t('cancel')}</Button><Button variant="outline" disabled={busy} onClick={() => void continueNavigation(false)}>{t('discard')}</Button><Button disabled={busy} onClick={() => void continueNavigation(true)}>{t('save')}</Button></div>
    </Dialog>
    <Dialog className="tcp-customer-dialog" open={!!customerForm} onOpenChange={(open) => { if (!open) closeCustomer() }} title={t(customerForm && snapshot.config.customers.some((entry) => entry.id === customerForm.id) ? 'editCustomer' : 'addCustomer')} description={t('customerHelp')}>
      {customerForm && <form onSubmit={(event) => { event.preventDefault(); void saveCustomer() }} className="customer-form">
        {!snapshot.config.customers.some((entry) => entry.id === customerForm.id) && snapshot.config.customers.length > 0 && <div className="copy-customer-fields"><label className="field"><span>{t('copyCustomerFrom')}</span><select aria-label={t('copyCustomerFrom')} value={copySource} disabled={busy} onChange={(event) => {
          const sourceId = event.target.value
          const source = snapshot.config.customers.find((entry) => entry.id === sourceId)
          setCopySource(sourceId)
          setCustomerForm({ ...customerForm, host: source?.host ?? '127.0.0.1', port: source?.port ?? 8080, protocol: source?.protocol ?? 'http', tcp: source?.tcp })
        }}><option value="">{t('emptyCustomer')}</option>{snapshot.config.customers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label><p className="field-hint">{t('copyCustomerHelp')}</p></div>}
        <label className="field"><span>{t('connection')}</span><select aria-label={t('connection')} disabled={busy} value={customerForm.protocol} onChange={(event) => setCustomerForm({ ...customerForm, protocol: event.target.value as 'http' | 'tcp' })}><option value="http">WebAPI (HTTP)</option><option value="tcp">TCP</option></select></label>

        <label className="field"><span>{t('customerName')}</span><input autoFocus aria-label={t('customerName')} value={customerForm.name} maxLength={100} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} disabled={busy} /></label><div className="route-fields"><label className="field"><span>{t('host')}</span><input aria-label={t('host')} value={customerForm.host} onChange={(event) => setCustomerForm({ ...customerForm, host: event.target.value })} disabled={busy} /></label><label className="field"><span>{t('port')}</span><input aria-label={t('port')} type="number" value={customerForm.port || ''} onChange={(event) => setCustomerForm({ ...customerForm, port: Number(event.target.value) })} disabled={busy} /></label></div>{customerForm.protocol === 'tcp' && <TcpSettings value={customerForm.tcp} onChange={(tcp) => setCustomerForm({ ...customerForm, tcp })} />}<div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeCustomer}>{t('cancel')}</Button><Button type="submit" disabled={busy}>{t('save')}</Button></div></form>}
    </Dialog>
    <Dialog open={!!deletion} onOpenChange={(open) => { if (!open) setDeletion(null) }} title={t(deletion === 'customer' ? 'deleteCustomer' : 'deleteEndpoint')} description={t(deletion === 'customer' ? 'deleteCustomerHelp' : 'deleteEndpointHelp')}><div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={() => setDeletion(null)}>{t('cancel')}</Button><Button disabled={busy} onClick={() => void remove()}>{t('delete')}</Button></div></Dialog>
  </div>
}
