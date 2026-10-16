import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Tooltip } from '@/components/ui/tooltip'
import { useUpdates, runUpdate } from '@/stores/update-store'
import { UpdateSection } from './update-section'

export function UpdateTrigger() {
  const { t } = useTranslation()
  const { snapshot, pending } = useUpdates()
  const [open, setOpen] = useState(false)
  const available = !!snapshot?.version
  const checking = snapshot?.phase === 'checking'
  const label = t(snapshot?.mode === 'demo' ? 'updateDemoCheck' : 'updateCheck')
  const status = available ? t(snapshot?.mode === 'demo' ? 'updateDemoAvailable' : 'update_available') : checking ? t('update_checking') : ''
  function showUpdates() {
    setOpen(true)
    // 已发现更新时保留下载状态；仅空闲时主动检查，不触发下载或安装。
    if (snapshot && snapshot.mode !== 'unavailable' && !pending && ['idle', 'current', 'error'].includes(snapshot.phase) && !available) void runUpdate(() => window.app.updater.check())
  }
  return <>
    <Tooltip label={[label, status].filter(Boolean).join(' · ')}><Button variant="ghost" size="sm" className="update-trigger" aria-label={[label, status].filter(Boolean).join(' · ')} aria-haspopup="dialog" aria-expanded={open} onClick={showUpdates}>
      <RefreshCw size={16} className={checking ? 'update-checking-icon' : undefined} /><span>{label}</span>{available && <span className="update-dot" aria-hidden="true" />}
    </Button></Tooltip>
    <Dialog open={open} onOpenChange={setOpen} title={t('updates')} description={t('updateEntryHelp')} className="update-dialog"><UpdateSection /></Dialog>
  </>
}
