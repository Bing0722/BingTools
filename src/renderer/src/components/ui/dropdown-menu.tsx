/**
 * 下拉菜单基础组件：复用 Radix 键盘导航与焦点管理，浮层通过 Portal 避免被布局裁切。
 */
import * as Primitive from '@radix-ui/react-dropdown-menu'
import type { ReactElement, ReactNode } from 'react'
export function DropdownMenu({ trigger, children }: { trigger: ReactElement; children: ReactNode }) {
  return <Primitive.Root><Primitive.Trigger asChild>{trigger}</Primitive.Trigger><Primitive.Portal>
    <Primitive.Content className="dropdown" align="end" sideOffset={6}>{children}</Primitive.Content>
  </Primitive.Portal></Primitive.Root>
}
export function DropdownItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return <Primitive.Item className="dropdown-item" onSelect={onSelect}>{children}</Primitive.Item>
}
