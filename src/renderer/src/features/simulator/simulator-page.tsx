/**
 * 服务器页面编排：正式配置来自 store，监听字段和接口草稿留在当前页面。
 * guard 串联自动保存和未保存确认，业务操作最终通过 window.app 进入主进程。
 */
import { NumberInput } from '@/components/ui/number-input'
import { TransferDialog } from '../transfer/transfer-dialog'
import { TcpSettings } from './tcp-settings'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const { snapshot, ready, busy: working, pendingToggle, pendingListener, error, run } = useSimulator()
  // 开关仍串行保存，但不让整页进入禁用/变灰状态。
  const busy = working && !pendingToggle && !pendingListener
  const customer = snapshot.config.customers.find((entry) => entry.id === snapshot.config.selectedCustomerId)
  // 正式快照保持只读；表单通过展开对象更新局部草稿，保存成功后再接受主进程结果。
  const [draft, setDraft] = useState<Endpoint | null>(null)
  const [listener, setListener] = useState({ host: '', port: '' })
  const [pending, setPending] = useState<Action | null>(null)
  const [customerForm, setCustomerForm] = useState<CustomerInput | null>(null)
  const [copySource, setCopySource] = useState('')
  const [deletion, setDeletion] = useState<'customer' | 'endpoint' | null>(null)
  const listenerSave = useRef<Promise<boolean> | null>(null)
  const [listenerFailed, setListenerFailed] = useState(false)
  const focusReturn = useRef<HTMLElement | null>(null)
  const locked = ['starting','running','stopping'].includes(snapshot.runtime.phase)
  const persisted = customer?.endpoints.find((entry) => entry.id === draft?.id)
  // 接口开关保存期间只忽略该 enabled 差异，避免先到的快照让弹窗短暂显示“未保存”。
  const endpointDirty = !!draft && !equal(pendingToggle === draft.id && persisted ? { ...draft, enabled: persisted.enabled } : draft, persisted)
  const listenerDirty = !!customer && (listener.host !== customer.host || listener.port !== String(customer.port))
  const dirty = endpointDirty || listenerDirty
  const blocker = useBlocker(dirty)
  const customerId = customer?.id

  // 客户 ID 改变时在绘制前重置编辑目标，避免新客户页面闪出上一客户的监听字段。
  useLayoutEffect(() => {
    const current = useSimulator.getState().snapshot.config.customers.find((entry) => entry.id === customerId)
    setDraft(null)
    setListener({ host: current?.host ?? '', port: current ? String(current.port) : '' })
  }, [customerId])

  async function saveListener(): Promise<boolean> {
    // 失焦、Enter 和启动可能连续触发保存，复用同一个 Promise 防止重复提交。
    if (listenerSave.current) return listenerSave.current
    if (!customer || !listenerDirty) return true
    if (locked || useSimulator.getState().busy) return false
    // CustomerInput 为严格 schema，只传入允许保存的业务字段。
    const input = customerInputSchema.safeParse({ id: customer.id, name: customer.name, host: listener.host, port: Number(listener.port), protocol: customer.protocol, tcp: customer.tcp })
    if (!input.success) { setListenerFailed(true); reportError('INVALID_INPUT'); return false }
    // 记录本次提交值；返回时只有草稿仍相同才替换，避免覆盖等待期间的新输入。
    const submitted = listener
    const operation = run(() => window.app.simulator.saveCustomer(input.data), undefined, undefined, true).then((saved) => {
      setListenerFailed(!saved)
      if (saved) setListener((current) => equal(current, submitted) ? { host: input.data.host, port: String(input.data.port) } : current)
      return saved
    }).finally(() => { listenerSave.current = null })
    listenerSave.current = operation
    return operation
  }
  // 客户切换、启动和打开其他编辑器都走同一入口：先保存监听，再保护接口草稿。
  async function guard(action: Action) {
    if (useSimulator.getState().busy && !listenerSave.current) return
    if (!await saveListener()) return
    if (endpointDirty) { focusReturn.current = document.activeElement as HTMLElement; setPending(() => action) }
    else await action()
  }
  // 路由切换先完成监听参数保存；有效输入不弹出未保存确认。
  useEffect(() => {
    if (blocker.state !== 'blocked' || endpointDirty || listenerFailed) return
    let alive = true
    void saveListener().then((saved) => { if (alive && saved) blocker.proceed() })
    return () => { alive = false }
    // 保存函数读取本次阻塞时的草稿，生命周期由路由阻塞状态控制。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state, endpointDirty, listenerFailed])
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
    if (endpointDirty && parsed && !parsed.success) {
      const issue = parsed.error.issues[0]
      reportError(['INVALID_JSON','INVALID_PATH','BODY_TOO_LARGE'].includes(issue.message) ? issue.message : issue.path[0] === 'path' ? 'INVALID_PATH' : 'INVALID_INPUT')
      return false
    }
    if (!await saveListener()) return false
    if (endpointDirty && parsed?.success) {
      if (!await run(() => window.app.simulator.saveEndpoint(customer.id, parsed.data), 'endpointSaved')) return false
      setDraft(parsed.data)
    }
    return true
  }
  // 只有保存成功或明确放弃后才执行原动作；校验失败则保留弹窗与输入。
  async function continueNavigation(save: boolean) {
    if (save && !await saveChanges()) return
    if (!save) {
      setDraft(persisted ?? null)
      if (customer) setListener({ host: customer.host, port: String(customer.port) })
    }
    // pending 保存真正要执行的动作，取消确认时只清空它，不改变当前页面。
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
  // 新接口默认关闭，编辑内容经显式保存后才进入正式客户配置。
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
  // IPv6 地址显示时需要方括号；TCP 不显示 HTTP 路径字段。
  const fullAddress = customer && draft ? `${customer.protocol}://${(listener.host || customer.host).includes(':') ? `[${listener.host || customer.host}]` : listener.host || customer.host}:${listener.port || customer.port}${customer.protocol === 'tcp' ? '' : draft.path}` : ''
  return <div className="simulator-page">
    <div className="simulator-top"><div className="simulator-title"><div><h1>{t('simulator')}</h1><p>{t(locked ? 'stopToEdit' : 'manualStart')}</p></div><div className="simulator-title-actions"><TransferDialog module="simulator" customer={customer ? { id: customer.id, name: customer.name, protocol: customer.protocol, interfaces: customer.endpoints } : undefined} hasCustomers={!!snapshot.config.customers.length} disabled={busy || endpointDirty} locked={locked} /><span className={`runtime-badge phase-${snapshot.runtime.phase}`} role="status"><Circle size={7} fill="currentColor" />{t(snapshot.runtime.phase)}</span></div></div>
      <div className="server-controls"><label className="field customer-select"><span>{t('customer')}</span><select aria-label={t('customer')} disabled={locked || busy || !customer} value={customer?.id ?? ''} onChange={(event) => { const id = event.target.value; guard(async () => { await run(() => window.app.simulator.selectCustomer(id)) }) }}>{!snapshot.config.customers.length && <option value="" disabled>—</option>}{snapshot.config.customers.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
        <div className="customer-buttons"><Button variant="outline" size="icon" disabled={locked || busy} aria-label={t('addCustomer')} onClick={() => openCustomer(false)}><Plus size={15} /></Button><Button className="customer-edit-button" variant="ghost" size="sm" disabled={!customer || locked || busy} aria-label={t('editCustomer')} onClick={() => openCustomer(true)}><Pencil size={14} /><span>{t('editCustomer')}</span></Button><Button variant="ghost" size="icon" disabled={!customer || locked || busy} aria-label={t('deleteCustomer')} onClick={() => guard(() => setDeletion('customer'))}><Trash2 size={14} /></Button></div>
        <label className="field protocol-field"><span>{t('connection')}</span><input readOnly aria-label={t('connection')} value={customer?.protocol === 'tcp' ? 'TCP' : 'WebAPI (HTTP)'} /></label>
        <label className="field host-field"><span>{t('host')}</span><input aria-label={t('host')} disabled={!customer || locked || busy} readOnly={pendingListener} aria-busy={pendingListener || undefined} value={listener.host} placeholder="127.0.0.1" onChange={(event) => { setListenerFailed(false); setListener({ ...listener, host: event.target.value }) }} onBlur={() => void saveListener()} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveListener() } }} /></label>
        <label className="field port-field"><span>{t('port')}</span><NumberInput aria-label={t('port')} type="number" min={1} max={65535} disabled={!customer || locked || busy} readOnly={pendingListener} aria-busy={pendingListener || undefined} value={listener.port} placeholder="8080" onChange={(event) => { setListenerFailed(false); setListener({ ...listener, port: event.target.value }) }} onBlur={() => void saveListener()} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveListener() } }} /></label>
        <Button className="server-action" disabled={!customer || busy} variant={locked ? 'outline' : 'default'} onClick={() => locked ? void run(() => window.app.simulator.stop()) : guard(async () => { if (customer) await run(() => window.app.simulator.start(customer.id)) })}>{locked ? <Square size={14} /> : <Play size={14} />}{t(locked ? 'stop' : 'start')}</Button>
      </div>
      {error === 'CONNECTION_FAILED' && <Button variant="ghost" size="sm" onClick={() => void run(() => window.app.simulator.getSnapshot())}>{t('retry')}</Button>}
    </div>
    <div className="simulator-workspace">{!customer ? <div className="empty-state"><Server size={32} /><h2>{t('noCustomers')}</h2><p>{t('noCustomersHelp')}</p><Button onClick={() => openCustomer(false)}><Plus size={15} />{t('addCustomer')}</Button></div> : <>
      <EndpointCards protocol={customer.protocol} key={customer.id} endpoints={customer.endpoints} busy={working && !pendingListener} pendingToggle={pendingToggle}
        onAdd={newEndpoint} onEdit={(entry) => guard(() => setDraft(entry))}
        onToggle={(entry) => guard(async () => { await run(() => window.app.simulator.setEndpointEnabled(customer.id, entry.id, !entry.enabled), undefined, entry.id) })}
        onReorder={(ids) => run(() => window.app.simulator.reorderEndpoints(customer.id, ids))} />
    </>}</div>
    <LogPanel customerId={customer?.id ?? null} />
    <Dialog className="endpoint-dialog" open={!!draft} onOpenChange={(open) => { if (!open) closeEndpoint() }} title={draft?.name || t('newEndpoint')} description={t('endpointDialogHelp')}>
      {draft && <div className="endpoint-modal-body">
          <div className="editor-fields" key={draft.id}><label className="field"><span>{t('endpointName')}</span><input aria-label={t('endpointName')} value={draft.name} maxLength={100} onChange={(event) => setField('name', event.target.value)} disabled={busy} /></label>{customer?.protocol !== 'tcp' && <div className="route-fields"><label className="field"><span>{t('method')}</span><select aria-label={t('method')} value={draft.method} onChange={(event) => setField('method', event.target.value as Endpoint['method'])} disabled={busy}>{methods.map((method) => <option key={method}>{method}</option>)}</select></label><label className="field"><span>{t('path')}</span><input aria-label={t('path')} value={draft.path} onChange={(event) => setField('path', event.target.value)} disabled={busy} /></label></div>}<code className="address-preview">{fullAddress}</code><p className="field-hint">{t(customer?.protocol === 'tcp' ? 'tcpEndpointHelp' : 'endpointHelp')}</p>
          <div className="response-fields"><label className="field"><span>{t('format')}</span><select aria-label={t('format')} value={draft.format} onChange={(event) => setField('format', event.target.value as Endpoint['format'])} disabled={busy}><option value="json">JSON</option><option value="text">{t('text')}</option></select></label>{customer?.protocol !== 'tcp' && <label className="field"><span>{t('statusCode')}</span><NumberInput aria-label={t('statusCode')} type="number" min={200} max={599} value={draft.status || ''} onChange={(event) => setField('status', Number(event.target.value))} disabled={busy} /></label>}<label className="enabled-field"><span>{t('enabled')}</span><button className="switch" role="switch" aria-label={t('enabled')} aria-checked={draft.enabled} aria-disabled={working} onClick={() => { if (!working) setField('enabled', !draft.enabled) }}><span /></button></label></div>
          {customer?.protocol !== 'tcp' && <><div className="response-delay-fields">
            <label className="enabled-field"><span>{t('responseDelay')}</span><button className="switch" role="switch" aria-label={t('responseDelay')} aria-checked={draft.responseDelay?.enabled ?? false} disabled={busy} onClick={() => setField('responseDelay', { ms: draft.responseDelay?.ms ?? 1000, enabled: !draft.responseDelay?.enabled })}><span /></button></label>
            <label className="field"><span>{t('responseDelayMs')}</span><NumberInput aria-label={t('responseDelayMs')} type="number" min={0} max={60000} step={1} value={Number.isNaN(draft.responseDelay?.ms) ? '' : draft.responseDelay?.ms ?? 1000} disabled={busy || !draft.responseDelay?.enabled} onChange={(event) => setField('responseDelay', { enabled: draft.responseDelay?.enabled ?? false, ms: event.target.value === '' ? NaN : Number(event.target.value) })} /></label>
          </div><p className="field-hint">{t('responseDelayHint')}</p></>}
          <ResponseBodyEditor key={draft.id + draft.format} body={draft.body} format={draft.format} disabled={busy} onChange={(body) => setField('body', body)} /><p className="field-hint">{t(customer?.protocol === 'tcp' ? 'tcpResponseHint' : 'responseHint')}</p></div>
        <div className="editor-footer"><Button variant="ghost" disabled={working} onClick={() => setDeletion('endpoint')}><Trash2 size={15} />{t('deleteEndpoint')}</Button><span className="muted">{t(endpointDirty ? 'unsaved' : 'saved')}</span><Button variant="outline" disabled={working} onClick={closeEndpoint}>{t('close')}</Button><Button disabled={working || !dirty} onClick={() => void saveChanges().then((saved) => { if (saved) setDraft(null) })}><Save size={15} />{t(busy ? 'saving' : 'saveEndpoint')}</Button></div>
      </div>}
    </Dialog>
    <Dialog open={!!pending || (blocker.state === 'blocked' && (endpointDirty || listenerFailed))} onOpenChange={(open) => { if (!open) cancelNavigation() }} title={t('unsavedTitle')} description={t('unsavedHelp')}>
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

        <label className="field"><span>{t('customerName')}</span><input autoFocus aria-label={t('customerName')} value={customerForm.name} maxLength={100} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} disabled={busy} /></label><div className="route-fields"><label className="field"><span>{t('host')}</span><input aria-label={t('host')} value={customerForm.host} onChange={(event) => setCustomerForm({ ...customerForm, host: event.target.value })} disabled={busy} /></label><label className="field"><span>{t('port')}</span><NumberInput aria-label={t('port')} type="number" min={1} max={65535} value={customerForm.port || ''} onChange={(event) => setCustomerForm({ ...customerForm, port: Number(event.target.value) })} disabled={busy} /></label></div>{customerForm.protocol === 'tcp' && <TcpSettings value={customerForm.tcp} onChange={(tcp) => setCustomerForm({ ...customerForm, tcp })} />}<div className="dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={closeCustomer}>{t('cancel')}</Button><Button type="submit" disabled={busy}>{t('save')}</Button></div></form>}
    </Dialog>
    <Dialog open={!!deletion} onOpenChange={(open) => { if (!open) setDeletion(null) }} title={t(deletion === 'customer' ? 'deleteCustomer' : 'deleteEndpoint')} description={t(deletion === 'customer' ? 'deleteCustomerHelp' : 'deleteEndpointHelp')}><div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={() => setDeletion(null)}>{t('cancel')}</Button><Button disabled={busy} onClick={() => void remove()}>{t('delete')}</Button></div></Dialog>
  </div>
}
