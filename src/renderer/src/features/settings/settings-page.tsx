import { UpdateSection } from '@/features/updater/update-section'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@/stores/settings-store'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
export function SettingsPage() {
  const { t } = useTranslation()
  const { preferences, update, saving, error } = useSettings()
  const [reset, setReset] = useState(false)
  const resetButton = useRef<HTMLButtonElement>(null)
  const choices = [{ id: 'light' as const, icon: Sun }, { id: 'dark' as const, icon: Moon }, { id: 'system' as const, icon: Monitor }]
  function closeReset(open: boolean) { setReset(open); if (!open) requestAnimationFrame(() => resetButton.current?.focus()) }
  return <div className="page-container settings-page"><div className="page-intro"><h1>{t('settings')}</h1><p>{t('appearanceHelp')}</p></div>
    <section className="settings-section"><h2>{t('appearance')}</h2><div className="theme-grid" role="group" aria-label={t('appearance')}>{choices.map(({ id, icon: Icon }) => <button disabled={saving} key={id} className={`theme-choice ${preferences.theme === id ? 'chosen' : ''}`} aria-pressed={preferences.theme === id} onClick={() => void update({ theme: id })}><div className={`theme-preview preview-${id}`} aria-hidden="true"><div className="preview-sidebar"><i /><i /><i /></div><div className="preview-content"><i /><i /><b /><b /></div></div><span><Icon size={15} />{t(id)}{preferences.theme === id && <Check size={15} className="choice-check" />}</span></button>)}</div>
      <div className="setting-row"><div><h3>{t('language')}</h3><p>{t('languageHelp')}</p></div><select aria-label={t('language')} disabled={saving} value={preferences.language} onChange={(event) => void update({ language: event.target.value as typeof preferences.language })}><option value="system">{t('system')}</option><option value="zh-CN">简体中文</option><option value="en">English</option></select></div>
    </section>
    <section className="settings-section"><h2>{t('layout')}</h2><div className="setting-row"><div><h3>{t('collapseSidebar')}</h3><p>{t('collapseHelp')}</p></div><button className="switch" role="switch" aria-label={t('collapseSidebar')} aria-checked={preferences.sidebarCollapsed} disabled={saving} onClick={() => void update({ sidebarCollapsed: !preferences.sidebarCollapsed })}><span /></button></div><div className="setting-row"><div><h3>{t('sidebarWidth')}</h3><p>{t('widthHelp')}</p></div><select aria-label={t('sidebarWidth')} disabled={saving} value={preferences.sidebarWidth} onChange={(event) => void update({ sidebarWidth: Number(event.target.value) })}>{[200,240,280,320].map((value, index) => <option key={value} value={value}>{t(['compact','standard','wide','extraWide'][index])} · {value}px</option>)}</select></div></section>
    <section className="settings-section"><h2>{t('appInfo')}</h2><div className="setting-row"><div><h3>BingTools</h3><p>{t('appDescription')}</p></div><span className="muted">0.2.0</span></div><div className="setting-row"><div><h3>{t('resetAppearance')}</h3><p>{t('resetHelp')}</p></div><Button ref={resetButton} variant="outline" size="sm" onClick={() => setReset(true)} disabled={saving}>{t('resetAppearance')}</Button></div></section>
    <UpdateSection />
    <div className="save-status" role="status">{t(saving ? 'saving' : error ?? 'autoSave')}</div>
    <Dialog open={reset} onOpenChange={closeReset} title={t('resetQuestion')} description={t('resetHelp')}><div className="dialog-actions"><Button variant="outline" onClick={() => closeReset(false)}>{t('cancel')}</Button><Button disabled={saving} onClick={async () => { if (await update({ theme: 'system', sidebarCollapsed: false, sidebarWidth: 240 })) closeReset(false) }}>{t('confirm')}</Button></div></Dialog>
  </div>
}
