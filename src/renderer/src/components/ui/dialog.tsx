import * as Primitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Button } from './button'
import { useTranslation } from 'react-i18next'
export function Dialog({ open, onOpenChange, title, description, children, className = '' }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; className?: string
}) {
  const { t } = useTranslation()
  const returnFocus = useRef<HTMLElement | null>(null)
  return <Primitive.Root open={open} onOpenChange={onOpenChange}><Primitive.Portal>
    <Primitive.Overlay className="dialog-overlay" />
    <Primitive.Content className={`dialog-content ${className}`} onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement }} onCloseAutoFocus={(event) => {
      // 受控弹窗没有 Radix Trigger，手动恢复打开前的键盘焦点。
      event.preventDefault()
      if (returnFocus.current?.isConnected) returnFocus.current.focus()
    }}>
      <Primitive.Title className="dialog-title">{title}</Primitive.Title>
      <Primitive.Description className="dialog-description">{description}</Primitive.Description>
      {children}
      <Primitive.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label={t('close')}><X size={18} /></Button></Primitive.Close>
    </Primitive.Content>
  </Primitive.Portal></Primitive.Root>
}
