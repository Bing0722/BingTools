/**
 * 数字输入基础组件：数值由父组件控制，步进委托浏览器以保留边界及精度语义。
 */
import { useRef, type InputHTMLAttributes } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** 保留原生 spinbutton、边界和键盘语义，只替换平台步进按钮的外观。 */
export function NumberInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { type?: 'number' }) {
  const ref = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()
  const value = props.value === '' || props.value == null ? NaN : Number(props.value)
  const unavailable = props.disabled || props.readOnly
  function step(direction: 1 | -1) {
    const input = ref.current
    if (!input || unavailable) return
    const previous = input.value
    // stepUp/Down 使用浏览器处理 min/max/step 与小数精度，不重复维护数值状态。
    if (direction === 1) input.stepUp(); else input.stepDown()
    const next = input.value
    if (next !== previous) {
      // React 跟踪器可能已看到 value；恢复旧值后通过原生 setter 派发真实 input 事件。
      input.value = previous
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, next)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    input.focus({ preventScroll: true })
  }
  return <span className={`number-control ${className}`} data-disabled={props.disabled || undefined}>
    <input {...props} ref={ref} type="number" />
    <span className="number-steppers">
      <button type="button" tabIndex={-1} aria-label={t('numberIncrease', { name: props['aria-label'] ?? '' })} disabled={unavailable || (props.max != null && value >= Number(props.max))} onMouseDown={(e) => e.preventDefault()} onClick={() => step(1)}><ChevronUp size={12} aria-hidden="true" /></button>
      <button type="button" tabIndex={-1} aria-label={t('numberDecrease', { name: props['aria-label'] ?? '' })} disabled={unavailable || (props.min != null && value <= Number(props.min))} onMouseDown={(e) => e.preventDefault()} onClick={() => step(-1)}><ChevronDown size={12} aria-hidden="true" /></button>
    </span>
  </span>
}
