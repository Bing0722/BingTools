import { useTranslation } from 'react-i18next'
import { defaultTcpSettings, type CustomerInput } from '../../../../shared/schemas/simulator'
export function TcpSettings({ value = defaultTcpSettings, onChange }: { value?: CustomerInput['tcp']; onChange: (value: NonNullable<CustomerInput['tcp']>) => void }) {
  const { t } = useTranslation()
  return <div className="tcp-settings">
    <p className="field-hint">{t('tcpHelp')}</p>
    <label className="field"><span>{t('tcpDelimiter')}</span><input aria-label={t('tcpDelimiter')} value={value.delimiter} onChange={(e) => onChange({ ...value, delimiter: e.target.value.replace(/\s/g, '') })} placeholder="0A" /></label>
    <label className="field"><span>{t('tcpExtraction')}</span><select aria-label={t('tcpExtraction')} value={value.extraction} onChange={(e) => onChange({ ...value, extraction: e.target.value as 'json' | 'text' })}><option value="json">JSON</option><option value="text">{t('text')}</option></select></label>
    {value.extraction === 'json' ? <label className="field"><span>{t('tcpField')}</span><input aria-label={t('tcpField')} value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value })} placeholder="action" /></label> : <div className="route-fields"><label className="field"><span>{t('tcpSeparator')}</span><input aria-label={t('tcpSeparator')} value={value.separator} onChange={(e) => onChange({ ...value, separator: e.target.value })} /></label><label className="field"><span>{t('tcpIndex')}</span><input aria-label={t('tcpIndex')} type="number" min={0} max={255} value={value.index} onChange={(e) => onChange({ ...value, index: Number(e.target.value) })} /></label></div>}
    <div className="enabled-field"><span>{t('tcpAppendDelimiter')}</span><button type="button" className="switch" role="switch" aria-label={t('tcpAppendDelimiter')} aria-checked={value.appendDelimiter} onClick={() => onChange({ ...value, appendDelimiter: !value.appendDelimiter })}><span /></button></div>
  </div>
}
