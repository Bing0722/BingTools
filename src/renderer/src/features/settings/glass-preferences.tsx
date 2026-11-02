import { useEffect, useState, type CSSProperties } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/stores/settings-store'

export function GlassPreferences() {
  const { t } = useTranslation()
  const { preferences, saving: savingAll, savingLayout, update } = useSettings()
  const saving = savingAll && !savingLayout
  const [intensity, setIntensity] = useState(preferences.glassIntensity)
  useEffect(() => { setIntensity(preferences.glassIntensity) }, [preferences.glassIntensity])
  return <div className="glass-settings">
    <div className="setting-row"><div><h3>{t('glassTitle')}</h3><p>{t('glassHelp')}</p></div>
      <button type="button" className="switch" role="switch" aria-label={t('glassTitle')} aria-checked={preferences.glassEnabled} disabled={saving} onClick={() => void update({ glassEnabled: !preferences.glassEnabled })}><span /></button>
    </div>
    <div className="glass-controls" data-disabled={!preferences.glassEnabled}>
      <div className="glass-demo" data-enabled={preferences.glassEnabled} style={{ '--glass-strength': intensity / 100 } as CSSProperties} aria-hidden="true"><div className="glass-demo-card"><Sparkles size={22} /><strong>{t('glassPreview')}</strong><span>BingTools</span></div></div>
      <div className="glass-adjust"><label htmlFor="glass-intensity">{t('glassIntensity')}<output htmlFor="glass-intensity">{intensity}%</output></label>
        <input id="glass-intensity" type="range" min={1} max={100} step={1} value={intensity} disabled={!preferences.glassEnabled || saving} onChange={(event) => setIntensity(Number(event.target.value))} aria-describedby="glass-hint" />
        <div className="glass-range-labels"><span>{t('glassSubtle')}</span><span>{t('glassRich')}</span></div>
        <p className="field-hint" id="glass-hint">{t('glassPreviewHelp')}</p>
        <Button variant="outline" size="sm" disabled={!preferences.glassEnabled || saving || intensity === preferences.glassIntensity} onClick={() => void update({ glassIntensity: intensity })}>{t('glassApply')}</Button>
      </div>
    </div>
  </div>
}
