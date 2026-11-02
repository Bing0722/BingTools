/**
 * 配置迁移弹窗：选择文件、预览摘要、确认导入分步执行；文件路径和正文留在主进程。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useNotifications } from '@/stores/notification-store'
import type { TransferModule, TransferPreview } from '../../../../shared/schemas/transfer'

export function TransferDialog({ module, customer, hasCustomers, disabled, locked }: {
  module: TransferModule; customer?: { id: string; name: string; interfaces: { id: string; name: string }[] }
  hasCustomers: boolean; disabled: boolean; locked: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [scope, setScope] = useState('current'), [interfaceId, setInterfaceId] = useState('')
  const [preview, setPreview] = useState<TransferPreview | null>(null), [status, setStatus] = useState('')
  function report(code: string) { useNotifications.getState().push(code, 'error') }
  // 选择和校验文件只产生摘要，不立刻导入；用户取消时 preview 保持为空。
  async function choose() {
    setBusy(true); setStatus(''); setPreview(null)
    try {
      const result = await window.app.transfer.choose(module)
      if (!result.ok) report(result.error.code)
      else setPreview(result.data)
    } catch { report('CONNECTION_FAILED') } finally { setBusy(false) }
  }
  async function apply() {
    if (!preview) return
    setBusy(true); setStatus('')
    try {
      // 通过 token 使用主进程已校验的预览，接口导入另附目标客户 ID。
      const result = await window.app.transfer.apply({ token: preview.token, customerId: preview.scope === 'interfaces' ? customer?.id : undefined })
      if (!result.ok) report(result.error.code)
      else { setPreview(null); setStatus('transferImported') }
    } catch { report('CONNECTION_FAILED') } finally { setBusy(false) }
  }
  async function exportFile() {
    setBusy(true); setStatus('')
    try {
      const result = await window.app.transfer.export({ module, scope: scope === 'interfaces' ? 'interfaces' : 'customers', customerId: scope === 'all' ? undefined : customer?.id, interfaceId: scope === 'interfaces' ? interfaceId || undefined : undefined })
      if (!result.ok) report(result.error.code)
      else if (result.data) setStatus('transferExported')
    } catch { report('CONNECTION_FAILED') } finally { setBusy(false) }
  }
  // 任务进行中阻止关闭；正常关闭时释放主进程预览，不让正文跨弹窗生命周期滞留。
  function changeOpen(value: boolean) {
    if (busy) return
    setOpen(value); setPreview(null); setStatus(''); setScope(customer ? 'current' : 'all'); setInterfaceId('')
    if (!value) void window.app.transfer.discard().catch(() => {})
  }
  return <>
    <Button variant="outline" size="sm" disabled={disabled} onClick={() => changeOpen(true)}><ArrowDownUp size={14} />{t('transferTitle')}</Button>
    <Dialog className="transfer-dialog" open={open} onOpenChange={changeOpen} title={t('transferTitle')} description={t('transferHelp')}>
      <section className="transfer-section"><h3>{t('transferExport')}</h3>
        <label className="field"><span>{t('transferScope')}</span><select aria-label={t('transferScope')} disabled={busy} value={scope} onChange={(e) => { setScope(e.target.value); setStatus('') }}>
          <option value="all">{t('transferAllCustomers')}</option><option value="current" disabled={!customer}>{t('transferCurrentCustomer')}</option><option value="interfaces" disabled={!customer?.interfaces.length}>{t('transferInterfaces')}</option>
        </select></label>
        {scope === 'interfaces' && <label className="field"><span>{t('transferSelectInterface')}</span><select aria-label={t('transferSelectInterface')} disabled={busy} value={interfaceId} onChange={(e) => setInterfaceId(e.target.value)}><option value="">{t('transferAllInterfaces')}</option>{customer?.interfaces.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>}
        <Button variant="outline" disabled={busy || !hasCustomers || (scope !== 'all' && !customer) || (scope === 'interfaces' && !customer?.interfaces.length)} onClick={() => void exportFile()}><Download size={14} />{t('transferExportFile')}</Button>
      </section>
      <section className="transfer-section"><h3>{t('transferImport')}</h3><p className="field-hint">{t('transferImportHelp')}</p>
        {locked && <p className="field-hint">{t('STOP_FIRST')}</p>}
        <Button variant="outline" disabled={busy || locked} onClick={() => void choose()}><Upload size={14} />{t('transferChoose')}</Button>
        {preview && <div className="transfer-preview"><p>{t('transferSummary', { customers: preview.customers, interfaces: preview.interfaces })}{preview.protocol ? ` · ${preview.protocol.toUpperCase()}` : ''}</p>
          <ul>{preview.names.map((name, index) => <li key={index}>{name}</li>)}</ul>
          <p className="field-hint">{t(preview.scope === 'customers' ? 'transferNewCustomers' : 'transferAppendInterfaces', { name: customer?.name ?? '—' })}</p>
          <Button disabled={busy || locked || (preview.scope === 'interfaces' && !customer)} onClick={() => void apply()}>{t('transferConfirm')}</Button>
        </div>}
      </section>
      <p role="status" className="field-hint">{busy ? t('transferWorking') : status ? t(status) : ''}</p>
    </Dialog>
  </>
}
