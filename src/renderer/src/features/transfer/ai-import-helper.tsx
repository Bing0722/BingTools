import { useMemo, useState } from 'react'
import { Check, Copy, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { buildAiImportPrompt, type AiImportOptions } from '../../../../shared/ai-import'

export function AiImportHelper({ protocol }: { protocol: AiImportOptions['protocol'] }) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = useState(protocol)
  const [copying, setCopying] = useState(false), [copied, setCopied] = useState(''), [failed, setFailed] = useState(false)
  const language = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en'
  const prompt = useMemo(() => buildAiImportPrompt({ protocol: selected, language }), [selected, language])
  async function copy() {
    setCopying(true); setFailed(false)
    try {
      const result = await window.app.transfer.copyAiPrompt({ protocol: selected, language })
      if (result.ok) setCopied(prompt)
      else { setCopied(''); setFailed(true) }
    } catch { setCopied(''); setFailed(true) } finally { setCopying(false) }
  }
  return <section className="ai-import-helper" aria-label={t('aiImportTitle')}>
    <div className="ai-import-heading"><Sparkles size={17} /><h3>{t('aiImportTitle')}</h3></div>
    <p className="field-hint">{t('aiImportHelp')}</p>
    <ol><li>{t('aiImportStep1')}</li><li>{t('aiImportStep2')}</li><li>{t('aiImportStep3')}</li></ol>
    <div className="ai-import-actions">
      {protocol !== 'motion' ? <label className="field"><span>{t('aiImportProtocol')}</span><select aria-label={t('aiImportProtocol')} value={selected} disabled={copying} onChange={(event) => { setSelected(event.target.value as 'http' | 'tcp'); setFailed(false) }}><option value="http">WebAPI (HTTP)</option><option value="tcp">TCP</option></select></label> : <span className="badge">{t('motion')}</span>}
      <Button variant="outline" disabled={copying} onClick={() => void copy()}>{copied === prompt ? <Check size={14} /> : <Copy size={14} />}{t(copying ? 'aiImportCopying' : copied === prompt ? 'aiImportCopied' : 'aiImportCopy')}</Button>
    </div>
    <p className="field-hint">{t('aiImportPrivacy')}</p>
    <details className="ai-import-preview"><summary>{t('aiImportPreview')}</summary><textarea aria-label={t('aiImportPrompt')} readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} /></details>
    <p className={failed ? 'inline-alert' : 'field-hint'} role="status">{failed ? t('AI_COPY_FAILED') : copied === prompt ? t('aiImportCopySuccess') : ''}</p>
  </section>
}
