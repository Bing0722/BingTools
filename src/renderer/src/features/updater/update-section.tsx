import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useUpdates, runUpdate as run } from '@/stores/update-store'
export function UpdateSection() {
  const { t } = useTranslation()
  const { snapshot, error, pending } = useUpdates()
  const [confirm, setConfirm] = useState(false)
  const busy = pending || !!snapshot && ['checking','downloading','installing'].includes(snapshot.phase)
  return <section className="settings-section update-section" aria-label={t('updates')}>
    <h2>{t('updates')}</h2>
    {snapshot ? <>
      <div className="setting-row"><div><h3>{t('currentVersion', { version: snapshot.currentVersion })}</h3><p>{snapshot.mode === 'demo' ? t('updateDemoHelp') : t('updateSource', { repository: snapshot.repository })}</p></div><span className="badge">{t(snapshot.mode === 'demo' ? 'updateDemo' : 'updateGitHub')}</span></div>
      <div className="update-status" role="status"><strong>{t(`update_${snapshot.phase}`)}</strong>{snapshot.version && <span>{t('updateVersion', { version: snapshot.version })}</span>}</div>
      {snapshot.phase === 'downloading' && <div className="update-progress"><progress aria-label={t('updateProgress')} max={100} value={snapshot.progress} /><span>{Math.round(snapshot.progress)}%</span></div>}
      {snapshot.mode === 'unavailable' && <p className="field-hint">{t('UPDATE_PACKAGED_ONLY')}</p>}
      {snapshot.mode === 'demo' && snapshot.phase === 'downloaded' && <p className="field-hint">{t('updateDemoComplete')}</p>}
      {snapshot.mode === 'github' && snapshot.canInstall === false && <p className="field-hint">{t('UPDATE_MANUAL_ONLY')}</p>}
      {<details className="update-notes" open><summary>{t('updateReleaseNotes')}{snapshot.releaseDate && ` · ${new Date(snapshot.releaseDate).toLocaleDateString()}`}</summary><pre>{snapshot.releaseNotes || __RELEASE_NOTES__}</pre></details>}
      <div className="update-actions">
        {snapshot.repository && <Button variant="outline" onClick={() => void run(() => window.app.updater.openRelease())}>{t('updateOpenRelease')}</Button>
        }
        <Button variant="outline" disabled={busy || snapshot.mode === 'unavailable' || snapshot.phase === 'downloaded'} onClick={() => void run(() => window.app.updater.check())}><RefreshCw size={14} />{t(snapshot.mode === 'demo' ? 'updateDemoCheck' : 'updateCheck')}</Button>
        {snapshot.phase === 'available' && snapshot.canInstall !== false && <Button disabled={busy} onClick={() => void run(() => window.app.updater.download())}><Download size={14} />{t(snapshot.mode === 'demo' ? 'updateDemoDownload' : 'updateDownload')}</Button>}
        {snapshot.phase === 'downloaded' && snapshot.mode === 'github' && <Button disabled={busy} onClick={() => setConfirm(true)}>{t('updateInstall')}</Button>}
      </div>
    </> : <p className="field-hint">{t('loading')}</p>}
    {(error || snapshot?.error) && <p className="inline-alert" role="alert">{t(error || snapshot?.error || '')}</p>}
    {!snapshot && error && <Button variant="outline" onClick={() => void run(() => window.app.updater.getSnapshot())}>{t('retry')}</Button>}
    <Dialog open={confirm} onOpenChange={setConfirm} title={t('updateInstallTitle')} description={t('updateInstallHelp')}><div className="dialog-actions"><Button variant="outline" onClick={() => setConfirm(false)}>{t('cancel')}</Button><Button onClick={() => { setConfirm(false); void run(() => window.app.updater.install()) }}>{t('updateInstall')}</Button></div></Dialog>
  </section>
}
