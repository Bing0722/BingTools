/**
 * 统一悬浮提示：受控开关便于在侧栏展开时及时关闭，Portal 避免被容器截断。
 */
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useEffect, useState, type ReactElement } from 'react'
export const TooltipProvider = TooltipPrimitive.Provider
export function Tooltip({ label, children, disabled = false, side = 'top' }: { label: string; children: ReactElement; disabled?: boolean; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  const [open, setOpen] = useState(false)
  // 禁用提示时同步关闭已打开浮层，防止侧栏展开后仍残留重复说明。
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  return <TooltipPrimitive.Root open={!disabled && open} onOpenChange={(next) => setOpen(!disabled && next)} disableHoverableContent><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal><TooltipPrimitive.Content className="tooltip" side={side} sideOffset={10} collisionPadding={12}>{label}<TooltipPrimitive.Arrow className="tooltip-arrow" /></TooltipPrimitive.Content></TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
}
