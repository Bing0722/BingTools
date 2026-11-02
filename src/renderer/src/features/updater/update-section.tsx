import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, CircleCheck, Download, ExternalLink, RefreshCw, Rocket, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useUpdates, runUpdate as run } from '@/stores/update-store'
export function UpdateSection() {
  const { t } = useTranslation()
  const { snapshot, error, pending } = useUpdates()
  const [confirm, setConfirm] = useState(false)
  const phase = snapshot?.phase ?? 'idle'
  const busy = pending || ['checking', 'downloading', 'installing'].includes(phase)
  const downloadRetry = phase === 'error' && snapshot?.error === 'UPDATE_DOWNLOAD_FAILED'
  const installRetry = phase === 'error' && snapshot?.error === 'UPDATE_INSTALL_FAILED'
  const Icon = phase === 'error' ? TriangleAlert : phase === 'current' || phase === 'downloaded' ? CircleCheck : phase === 'checking' ? RefreshCw : phase === 'downloading' ? Download : Rocket
  const title = phase === 'available' ? 'updateReadyTitle' : phase === 'current' ? 'updateCurrentTitle' : phase === 'idle' ? 'updateIdleTitle' : `update_${phase}`
  const help = { idle: 'updateIdleHelp', checking: 'updateCheckingHelp', available: 'updateAvailableHelp', current: 'updateCurrentHelp', downloading: 'updateDownloadingHelp', downloaded: 'updateDownloadedHelp', installing: 'updateInstallingHelp', error: 'updateErrorHelp' }[phase]
  const step = ['downloaded', 'installing'].includes(phase) || installRetry ? 2 : ['available', 'downloading'].includes(phase) || downloadRetry ? 1 : 0
  return <section className="settings-section update-section" aria-label={t('updates')}>
    <h2>{t('updates')}</h2>
    {snapshot ? <div className="update-card" data-phase={phase}>
      <div className="update-card-heading"><span className="update-eyebrow">{t('updateEyebrow')}</span><span className="badge">{t(snapshot.mode === 'demo' ? 'updateDemo' : 'updateGitHub')}</span></div>
      <div className="update-hero" role="status"><div className="update-hero-icon"><Icon size={27} className={phase === 'checking' ? 'update-checking-icon' : undefined} /></div><div><h3>{t(title)}</h3><p>{t(snapshot.mode === 'demo' ? 'updateDemoFlowHelp' : snapshot.mode === 'unavailable' ? 'UPDATE_PACKAGED_ONLY' : snapshot.canInstall === false ? 'UPDATE_MANUAL_ONLY' : help)}</p></div></div>
      <div className="update-versions"><div><span>{t('updateInstalled')}</span><strong>{snapshot.currentVersion}</strong></div>{snapshot.version && <><ArrowRight size={16} aria-hidden="true" /><div><span>{t('updateTarget')}</span><strong>{snapshot.version}</strong></div></>}</div>
      {snapshot.canInstall !== false && snapshot.mode !== 'unavailable' && <ol className="update-flow" aria-label={t('updates')}>{['updateStepCheck', 'updateStepDownload', 'updateStepInstall'].map((label, index) => <li key={label} data-done={index < step} aria-current={index === step ? 'step' : undefined}><i aria-hidden="true">{index < step ? <Check size={12} /> : index + 1}</i><span>{t(label)}</span></li>)}</ol>}
      {phase === 'downloading' && <div className="update-download"><div><span>{t('updateProgress')}</span><strong>{Math.round(snapshot.progress)}%</strong></div><progress aria-label={t('updateProgress')} max={100} value={snapshot.progress} /></div>}
      {snapshot.mode === 'demo' && phase === 'downloaded' && <p className="field-hint">{t('updateDemoComplete')}</p>}
      {(error || snapshot.error) && <p className="inline-alert" role="alert">{t(error || snapshot.error || '')}</p>}
      <div className="update-actions">
        <Button variant={snapshot.version ? 'ghost' : 'default'} disabled={busy || snapshot.mode === 'unavailable' || phase === 'downloaded' || installRetry} onClick={() => void run(() => window.app.updater.check())}><RefreshCw size={14} />{t(snapshot.mode === 'demo' ? 'updateDemoCheck' : 'updateCheck')}</Button>
        {(phase === 'available' || downloadRetry) && snapshot.canInstall !== false && <Button disabled={busy} onClick={() => void run(() => window.app.updater.download())}><Download size={15} />{t(snapshot.mode === 'demo' ? 'updateDemoDownload' : downloadRetry ? 'updateRetryDownload' : 'updateDownload')}</Button>}
        {(phase === 'downloaded' || installRetry) && snapshot.mode === 'github' && <Button disabled={busy} onClick={() => setConfirm(true)}><Rocket size={15} />{t('updateInstall')}</Button>}
        {snapshot.repository && <Button variant={snapshot.version && snapshot.canInstall === false ? 'default' : 'outline'} onClick={() => void run(() => window.app.updater.openRelease())}><ExternalLink size={14} />{t(snapshot.version && snapshot.canInstall === false ? 'updateManualAction' : 'updateOpenRelease')}</Button>}
      </div>
      <details className="update-notes" open={phase === 'available' && !!snapshot.releaseNotes}><summary>{t('updateReleaseNotes')}{snapshot.releaseDate && ` · ${new Date(snapshot.releaseDate).toLocaleDateString()}`}</summary><pre>{snapshot.version ? snapshot.releaseNotes || t('updateNoNotes') : __RELEASE_NOTES__}</pre></details>
      <p className="update-source">{snapshot.mode === 'demo' ? t('updateDemoHelp') : t('updateSource', { repository: snapshot.repository })}</p>
    </div> : <div role="status" className="update-card"><p>{t(error || 'loading')}</p>{error && <Button variant="outline" onClick={() => void run(() => window.app.updater.getSnapshot())}>{t('retry')}</Button>}</div>}
    <Dialog open={confirm} onOpenChange={setConfirm} title={t('updateInstallTitle')} description={t('updateInstallHelp')}><div className="dialog-actions"><Button variant="outline" onClick={() => setConfirm(false)}>{t('cancel')}</Button><Button disabled={busy} onClick={() => { setConfirm(false); void run(() => window.app.updater.install()) }}>{t('updateInstall')}</Button></div></Dialog>
  </section>
}
