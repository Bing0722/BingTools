/**
 * 响应正文编辑器：JSON 即时诊断与美化仅修改草稿，正式生效仍需保存接口。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { beautifyJson, checkJson } from './json-body'

export function ResponseBodyEditor({ body, format, disabled, onChange }: {
  body: string; format: 'json' | 'text'; disabled: boolean; onChange: (body: string) => void
}) {
  const { t } = useTranslation()
  // 只在正文或格式变化时重算诊断，文本模式无需执行 JSON 解析。
  const check = useMemo(() => format === 'json' ? checkJson(body) : null, [body, format])
  const [formatError, setFormatError] = useState<string>()
  const invalid = check && !check.valid
  // 美化失败只更新字段错误，保留原始 body；成功也仅通知父组件修改草稿。
  function beautify() {
    try { onChange(beautifyJson(body)); setFormatError(undefined) }
    catch (error) { setFormatError(error instanceof Error ? error.message : 'INVALID_JSON') }
  }
  return <div className="field body-field">
    <div className="body-toolbar"><label htmlFor="response-body">{t('responseBody')}</label>
      {format === 'json' && <Button variant="ghost" size="sm" disabled={disabled || !!invalid} onClick={beautify}><WandSparkles size={14} />{t('beautifyJson')}</Button>}
    </div>
    <textarea id="response-body" aria-label={t('responseBody')} aria-invalid={!!invalid} aria-describedby={format === 'json' ? 'json-validation' : undefined}
      value={body} spellCheck={false} disabled={disabled} onChange={(event) => { setFormatError(undefined); onChange(event.target.value) }} />
    {check && <p id="json-validation" className={invalid || formatError ? 'json-feedback json-invalid' : 'json-feedback'} role="status">
      {invalid ? t(check.code) + (check.line ? ' ' + t('jsonLocation', { line: check.line, column: check.column }) : '') : formatError ? t(formatError) : t('jsonValid')}
    </p>}
  </div>
}
