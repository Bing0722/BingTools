import { useEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Circle, FileJson, Pencil, Play, Plus, Save, Server, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useSimulator } from '@/stores/simulator-store'
import { customerInputSchema, endpointSchema, methods, type CustomerInput, type Endpoint } from '../../../../shared/schemas/simulator'
import { LogPanel } from './log-panel'

type Action = () => void | Promise<void>
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
export function SimulatorPage() {
  const { t } = useTranslation()
  const { snapshot, ready, busy, error, run } = useSimulator()
  const customer = snapshot.config.customers.find((entry) => entry.id === snapshot.config.selectedCustomerId)
  const [draft, setDraft] = useState<Endpoint | null>(null)
  const [listener, setListener] = useState({ host: '', port: '' })
  const [localError, setLocalError] = useState<string>()
  const [pending, setPending] = useState<Action | null>(null)
  const [customerForm, setCustomerForm] = useState<CustomerInput | null>(null)
  const [customerError, setCustomerError] = useState<string>()
  const [deletion, setDeletion] = useState<'customer' | 'endpoint' | null>(null)
  const focusReturn = useRef<HTMLElement | null>(null)
  const locked = ['starting','running','stopping'].includes(snapshot.runtime.phase)
  const persisted = customer?.endpoints.find((entry) => entry.id === draft?.id)
  const endpointDirty = !!draft && !equal(draft, persisted)
  const listenerDirty = !!customer && (listener.host !== customer.host || listener.port !== String(customer.port))
  const dirty = endpointDirty || listenerDirty
  const displayError = localError || error || snapshot.runtime.error
  const blocker = useBlocker(dirty)
  const customerId = customer?.id

  useEffect(() => {
    const current = useSimulator.getState().snapshot.config.customers.find((entry) => entry.id === customerId)
    setDraft(current?.endpoints[0] ?? null)
    setListener({ host: current?.host ?? '', port: current ? String(current.port) : '' })
    setLocalError(undefined)
  }, [customerId])

  function guard(action: Action) {
    setLocalError(undefined)
    if (dirty) { focusReturn.current = document.activeElement as HTMLElement; setPending(() => action) }
    else void action()
  }
  function setField<K extends keyof Endpoint>(key: K, value: Endpoint[K]) {
    setLocalError(undefined)
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }
  async function saveChanges(): Promise<boolean> {
    if (!customer) return false
    // 先校验全部草稿，再开始写入，避免基础格式错误导致部分保存。
    const parsed = draft ? endpointSchema.safeParse(draft) : null
    const customerInput = customerInputSchema.safeParse({ id: customer.id, name: customer.name, host: listener.host, port: Number(listener.port), protocol: 'http' })
    if (endpointDirty && parsed && !parsed.success) {
      const issue = parsed.error.issues[0]
      setLocalError(['INVALID_JSON','INVALID_PATH','BODY_TOO_LARGE'].includes(issue.message) ? issue.message : issue.path[0] === 'path' ? 'INVALID_PATH' : 'INVALID_INPUT')
      return false
    }
    if (listenerDirty && !customerInput.success) { setLocalError('INVALID_INPUT'); return false }
    if (listenerDirty && customerInput.success && !await run(() => window.app.simulator.saveCustomer(customerInput.data), 'customerSaved')) return false
    if (endpointDirty && parsed?.success) {
      if (!await run(() => window.app.simulator.saveEndpoint(customer.id, parsed.data), 'endpointSaved')) return false
      setDraft(parsed.data)
    }
    setLocalError(undefined)
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
  function newEndpoint() {
    guard(() => setDraft({ id: crypto.randomUUID(), name: t('newEndpoint'), path: '/api/example', method: 'GET', format: 'json', status: 200, body: '{\n  "ok": true\n}', enabled: false }))
  }
  function openCustomer(edit: boolean) {
    guard(() => {
      focusReturn.current = document.activeElement as HTMLElement
      setCustomerError(undefined)
      setCustomerForm(edit && customer ? { id: customer.id, name: customer.name, host: customer.host, port: customer.port, protocol: 'http' } : { id: crypto.randomUUID(), name: '', host: '127.0.0.1', port: 8080, protocol: 'http' })
    })
  }
  function closeCustomer() { setCustomerForm(null); requestAnimationFrame(() => focusReturn.current?.focus()) }
  async function saveCustomer() {
    const parsed = customerInputSchema.safeParse(customerForm)
    if (!parsed.success) { setCustomerError('INVALID_INPUT'); return }
    if (await run(() => window.app.simulator.saveCustomer(parsed.data), 'customerSaved')) {
      setListener({ host: parsed.data.host, port: String(parsed.data.port) })
      closeCustomer()
    } else setCustomerError(useSimulator.getState().error)
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
  const fullAddress = customer && draft ? `http://${(listener.host || customer.host).includes(':') ? `[${listener.host || customer.host}]` : listener.host || customer.host}:${listener.port || customer.port}${draft.path}` : ''
  return <div className="simulator-page">
    <div className="simulator-top"><div className="simulator-title"><div><h1>{t('simulator')}</h1><p>{t('manualStart')}</p></div><span className={`runtime-badge phase-${snapshot.runtime.phase}`} role="status"><Circle size={7} fill="currentColor" />{t(snapshot.runtime.phase)}</span></div>
      <div className="server-controls"><label className="field customer-select"><span>{t('customer')}</span><select aria-label={t('customer')} disabled={locked || busy || !customer} value={customer?.id ?? ''} onChange={(event) => { const id = event.target.value; guard(async () => { await run(() => window.app.simulator.selectCustomer(id)) }) }}><option value="" disabled>—</option>{snapshot.config.customers.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
        <div className="customer-buttons"><Button variant="outline" size="icon" disabled={locked || busy} aria-label={t('addCustomer')} onClick={() => openCustomer(false)}><Plus size={15} /></Button><Button variant="ghost" size="icon" disabled={!customer || locked || busy} aria-label={t('editCustomer')} onClick={() => openCustomer(true)}><Pencil size={14} /></Button><Button variant="ghost" size="icon" disabled={!customer || locked || busy} aria-label={t('deleteCustomer')} onClick={() => guard(() => setDeletion('customer'))}><Trash2 size={14} /></Button></div>
        <label className="field protocol-field"><span>{t('connection')}</span><input readOnly aria-label={t('connection')} value="WebAPI (HTTP)" /></label>
        <label className="field host-field"><span>{t('host')}</span><input aria-label={t('host')} disabled={!customer || locked || busy} value={listener.host} placeholder="127.0.0.1" onChange={(event) => setListener({ ...listener, host: event.target.value })} /></label>
        <label className="field port-field"><span>{t('port')}</span><input aria-label={t('port')} type="number" min={1} max={65535} disabled={!customer || locked || busy} value={listener.port} placeholder="8080" onChange={(event) => setListener({ ...listener, port: event.target.value })} /></label>
        {listenerDirty && <Button variant="outline" disabled={busy} onClick={() => void saveChanges()}><Save size={14} />{t('save')}</Button>}
        <Button className="server-action" disabled={!customer || busy} variant={locked ? 'outline' : 'default'} onClick={() => locked ? void run(() => window.app.simulator.stop()) : guard(async () => { if (customer) await run(() => window.app.simulator.start(customer.id)) })}>{locked ? <Square size={14} /> : <Play size={14} />}{t(locked ? 'stop' : 'start')}</Button>
      </div>{locked && <p className="listener-hint">{t('stopToEdit')}</p>}
      {(displayError || snapshot.warning) && <div role={displayError ? 'alert' : 'status'} className="inline-alert">{t(displayError || snapshot.warning || '')}{error === 'CONNECTION_FAILED' && <Button variant="ghost" size="sm" onClick={() => void run(() => window.app.simulator.getSnapshot())}>{t('retry')}</Button>}</div>}
    </div>
    <div className="simulator-workspace">{!customer ? <div className="empty-state"><Server size={32} /><h2>{t('noCustomers')}</h2><p>{t('noCustomersHelp')}</p><Button onClick={() => openCustomer(false)}><Plus size={15} />{t('addCustomer')}</Button></div> : <>
      <section className="endpoint-list" aria-label={t('endpoints')}><div className="endpoint-list-header"><h2>{t('endpoints')} <span className="badge">{customer.endpoints.length}</span></h2><Button size="icon" variant="ghost" aria-label={t('addEndpoint')} disabled={busy} onClick={newEndpoint}><Plus size={17} /></Button></div><div className="endpoint-items">{!customer.endpoints.length && <div className="empty-mini"><FileJson size={24} /><p>{t('noEndpoints')}</p><small>{t('noEndpointsHelp')}</small></div>}{customer.endpoints.map((entry) => <div className={`endpoint-item ${draft?.id === entry.id ? 'selected' : ''}`} key={entry.id}><button className="endpoint-select" onClick={() => guard(() => setDraft(useSimulator.getState().snapshot.config.customers.find((item) => item.id === customer.id)?.endpoints.find((item) => item.id === entry.id) ?? null))}><span className="endpoint-name">{entry.name}</span><span><b className={`method method-${entry.method.toLowerCase()}`}>{entry.method}</b><code>{entry.path}</code></span></button><button className="switch" role="switch" disabled={busy} aria-label={t('enableEndpoint', { name: entry.name })} aria-checked={entry.enabled} onClick={() => guard(async () => {
        if (await run(() => window.app.simulator.setEndpointEnabled(customer.id, entry.id, !entry.enabled), 'endpointToggled')) {
          if (draft?.id === entry.id) setDraft(useSimulator.getState().snapshot.config.customers.find((item) => item.id === customer.id)?.endpoints.find((item) => item.id === entry.id) ?? null)
        }
      })}><span /></button></div>)}</div><div className="endpoint-list-footer">{t('activeCount', { count: customer.endpoints.filter((entry) => entry.enabled).length })}</div></section>
      <section className="endpoint-editor" aria-label={t('edit')}>
        {!draft ? <div className="empty-state"><FileJson size={32} /><h2>{t('selectEndpoint')}</h2><Button variant="outline" onClick={newEndpoint}>{t('addEndpoint')}</Button></div> : <><div className="editor-heading"><h2>{draft.name || t('newEndpoint')}</h2>{endpointDirty && <span className="badge">{t('unsaved')}</span>}<Button size="icon" variant="ghost" disabled={busy} aria-label={t('deleteEndpoint')} onClick={() => setDeletion('endpoint')}><Trash2 size={15} /></Button></div>
          <div className="editor-fields"><label className="field"><span>{t('endpointName')}</span><input aria-label={t('endpointName')} value={draft.name} maxLength={100} onChange={(event) => setField('name', event.target.value)} disabled={busy} /></label><div className="route-fields"><label className="field"><span>{t('method')}</span><select aria-label={t('method')} value={draft.method} onChange={(event) => setField('method', event.target.value as Endpoint['method'])} disabled={busy}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label><label className="field"><span>{t('path')}</span><input aria-label={t('path')} value={draft.path} onChange={(event) => setField('path', event.target.value)} disabled={busy} /></label></div><code className="address-preview">{fullAddress}</code><p className="field-hint">{t('endpointHelp')}</p>
          <div className="response-fields"><label className="field"><span>{t('format')}</span><select aria-label={t('format')} value={draft.format} onChange={(event) => setField('format', event.target.value as Endpoint['format'])} disabled={busy}><option value="json">JSON</option><option value="text">{t('text')}</option></select></label><label className="field"><span>{t('statusCode')}</span><input aria-label={t('statusCode')} type="number" min={200} max={599} value={draft.status || ''} onChange={(event) => setField('status', Number(event.target.value))} disabled={busy} /></label><label className="enabled-field"><span>{t('enabled')}</span><button className="switch" role="switch" aria-label={t('enabled')} aria-checked={draft.enabled} disabled={busy} onClick={() => setField('enabled', !draft.enabled)}><span /></button></label></div>
          <label className="field body-field"><span>{t('responseBody')}</span><textarea aria-label={t('responseBody')} value={draft.body} spellCheck={false} disabled={busy} onChange={(event) => setField('body', event.target.value)} /></label><p className="field-hint">{t('responseHint')}</p></div>
          <div className="editor-footer"><span className="muted">{t(endpointDirty ? 'unsaved' : 'saved')}</span><Button disabled={busy || !dirty} onClick={() => void saveChanges()}><Save size={15} />{t(busy ? 'saving' : 'saveEndpoint')}</Button></div></>}
      </section>
    </>}</div>
    <LogPanel customerId={customer?.id ?? null} />
    <Dialog open={!!pending || blocker.state === 'blocked'} onOpenChange={(open) => { if (!open) cancelNavigation() }} title={t('unsavedTitle')} description={t('unsavedHelp')}>
      {(localError || error) && <p className="inline-alert" role="alert">{t(localError || error || '')}</p>}<div className="dialog-actions"><Button variant="ghost" disabled={busy} onClick={cancelNavigation}>{t('cancel')}</Button><Button variant="outline" disabled={busy} onClick={() => void continueNavigation(false)}>{t('discard')}</Button><Button disabled={busy} onClick={() => void continueNavigation(true)}>{t('save')}</Button></div>
    </Dialog>
    <Dialog open={!!customerForm} onOpenChange={(open) => { if (!open) closeCustomer() }} title={t(customerForm && snapshot.config.customers.some((entry) => entry.id === customerForm.id) ? 'editCustomer' : 'addCustomer')} description={t('customerHelp')}>
      {customerForm && <form onSubmit={(event) => { event.preventDefault(); void saveCustomer() }} className="customer-form"><label className="field"><span>{t('customerName')}</span><input autoFocus aria-label={t('customerName')} value={customerForm.name} maxLength={100} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} disabled={busy} /></label><div className="route-fields"><label className="field"><span>{t('host')}</span><input aria-label={t('host')} value={customerForm.host} onChange={(event) => setCustomerForm({ ...customerForm, host: event.target.value })} disabled={busy} /></label><label className="field"><span>{t('port')}</span><input aria-label={t('port')} type="number" value={customerForm.port || ''} onChange={(event) => setCustomerForm({ ...customerForm, port: Number(event.target.value) })} disabled={busy} /></label></div>{customerError && <p role="alert" className="inline-alert">{t(customerError)}</p>}<div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeCustomer}>{t('cancel')}</Button><Button type="submit" disabled={busy}>{t('save')}</Button></div></form>}
    </Dialog>
    <Dialog open={!!deletion} onOpenChange={(open) => { if (!open) setDeletion(null) }} title={t(deletion === 'customer' ? 'deleteCustomer' : 'deleteEndpoint')} description={t(deletion === 'customer' ? 'deleteCustomerHelp' : 'deleteEndpointHelp')}><div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={() => setDeletion(null)}>{t('cancel')}</Button><Button disabled={busy} onClick={() => void remove()}>{t('delete')}</Button></div></Dialog>
  </div>
}
