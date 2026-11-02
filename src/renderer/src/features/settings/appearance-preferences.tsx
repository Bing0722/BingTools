import { useEffect, useState, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/stores/settings-store'
import { colorPalettes, hasLocalFont, localFontCandidates, uiFontStack } from '@/lib/appearance'
import { localFontSchema, themeColors, type Preferences } from '../../../../shared/schemas/settings'

export function AppearancePreferences() {
  const { t } = useTranslation()
  const { preferences, saving, update } = useSettings()
  const [fontChoice, setFontChoice] = useState(preferences.uiFont)
  const [family, setFamily] = useState(preferences.localFont)
  const [available, setAvailable] = useState<string[]>([])
  const [loadingFonts, setLoadingFonts] = useState(true), [checking, setChecking] = useState(false), [fontError, setFontError] = useState('')
  useEffect(() => { setFontChoice(preferences.uiFont); setFamily(preferences.localFont); setFontError('') }, [preferences.uiFont, preferences.localFont])
  useEffect(() => {
    let alive = true
    void Promise.all(localFontCandidates.map(async (name) => await hasLocalFont(name) ? name : null)).then((fonts) => {
      if (alive) { setAvailable(fonts.filter((name): name is string => !!name)); setLoadingFonts(false) }
    })
    return () => { alive = false }
  }, [])
  async function chooseFont(choice: Preferences['uiFont']) {
    setFontChoice(choice); setFontError('')
    if (choice !== 'local' && !await update({ uiFont: choice })) setFontChoice(preferences.uiFont)
  }
  async function applyLocal() {
    const parsed = localFontSchema.safeParse(family)
    if (!parsed.success) { setFontError('fontInvalid'); return }
    setChecking(true); setFontError('')
    try {
      if (!await hasLocalFont(parsed.data)) { setFontError('fontUnavailable'); return }
      await update({ uiFont: 'local', localFont: parsed.data })
    } finally { setChecking(false) }
  }
  return <>
    <div className="appearance-section"><h3>{t('themeColor')}</h3><p className="field-hint">{t('themeColorHelp')}</p>
      <div className="color-grid" role="group" aria-label={t('themeColor')}>{themeColors.map((color) => <button type="button" key={color} disabled={saving} aria-pressed={preferences.themeColor === color} className="color-choice" onClick={() => void update({ themeColor: color })} style={{ '--swatch': colorPalettes[color].light } as CSSProperties}>
        <i aria-hidden="true">{preferences.themeColor === color && <Check size={14} />}</i><span>{t(`color_${color}`)}</span>
      </button>)}</div>
    </div>
    <div className="setting-row"><div><h3>{t('interfaceFont')}</h3><p>{t('fontHelp')}</p></div>
      <select aria-label={t('interfaceFont')} disabled={saving || checking} value={fontChoice} onChange={(e) => void chooseFont(e.target.value as Preferences['uiFont'])}>
        <option value="system">{t('fontSystem')}</option><option value="noto">{t('fontNoto')}</option><option value="local">{t('fontLocal')}</option>
      </select>
    </div>
    {fontChoice === 'local' && <div className="local-font-settings">
      <label className="field"><span>{t('localFontPresets')}</span><select aria-label={t('localFontPresets')} disabled={loadingFonts || checking || saving} value={available.includes(family) ? family : ''} onChange={(e) => { setFamily(e.target.value); setFontError('') }}><option value="">{t(loadingFonts ? 'loading' : 'fontOther')}</option>{available.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="field"><span>{t('localFontName')}</span><input aria-label={t('localFontName')} aria-invalid={!!fontError} aria-describedby="local-font-help" maxLength={100} value={family} disabled={checking || saving} onChange={(e) => { setFamily(e.target.value); setFontError('') }} /></label>
      <Button variant="outline" disabled={checking || saving} onClick={() => void applyLocal()}>{t(checking ? 'fontChecking' : 'fontApply')}</Button>
      <p id="local-font-help" className={fontError ? 'inline-alert' : 'field-hint'}>{t(fontError || 'localFontHelp')}</p>
    </div>}
    <div className="font-preview" style={{ fontFamily: uiFontStack({ uiFont: fontChoice, localFont: localFontSchema.safeParse(family).success ? family : preferences.localFont }) }}>
      <span className="field-hint">{t('fontPreview')}</span><p>清晰舒适，从每一个字符开始。</p><p>BingTools · Make room for your ideas. 0123456789</p>
    </div>
  </>
}
