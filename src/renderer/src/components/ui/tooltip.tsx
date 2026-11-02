import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { useEffect, useState, type ReactElement } from 'react'
export const TooltipProvider = TooltipPrimitive.Provider
export function Tooltip({ label, children, disabled = false, side = 'top' }: { label: string; children: ReactElement; disabled?: boolean; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  const [open, setOpen] = useState(false)
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  return <TooltipPrimitive.Root open={!disabled && open} onOpenChange={(next) => setOpen(!disabled && next)} disableHoverableContent><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal><TooltipPrimitive.Content className="tooltip" side={side} sideOffset={10} collisionPadding={12}>{label}<TooltipPrimitive.Arrow className="tooltip-arrow" /></TooltipPrimitive.Content></TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
}
