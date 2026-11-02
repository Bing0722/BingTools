/**
 * 主题快捷入口：复用正式设置 API，与设置页共享已保存偏好和局部忙碌反馈。
 */
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@/stores/settings-store'
import { Tooltip } from '@/components/ui/tooltip'
import type { Preferences } from '../../../shared/schemas/settings'

const modes = [{ id: 'light', icon: Sun }, { id: 'dark', icon: Moon }, { id: 'system', icon: Monitor }] as const
export function ThemeShortcut({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation()
  const { preferences, saving: savingAll, savingLayout, update } = useSettings()
  const saving = savingAll && !savingLayout
  const Icon = modes.find((mode) => mode.id === preferences.theme)!.icon
  return <Menu.Root><Tooltip disabled={!collapsed} side="right" label={t('quickTheme')}><Menu.Trigger asChild>
    <button className="nav-item theme-shortcut" type="button" aria-label={t('quickTheme')} disabled={saving}><Icon size={17} /><span>{t('quickTheme')}</span><span className="theme-shortcut-mode">{t(preferences.theme)}</span></button>
  </Menu.Trigger></Tooltip><Menu.Portal><Menu.Content className="theme-menu" side="top" align="start" sideOffset={8} collisionPadding={12} aria-label={t('quickTheme')}>
    <Menu.RadioGroup value={preferences.theme} onValueChange={(theme) => void update({ theme: theme as Preferences['theme'] })}>{modes.map(({ id, icon: ModeIcon }) => <Menu.RadioItem key={id} value={id} className="theme-menu-item" disabled={saving}>
      <ModeIcon size={15} /><span>{t(id)}</span><Menu.ItemIndicator><Check size={14} /></Menu.ItemIndicator>
    </Menu.RadioItem>)}</Menu.RadioGroup>
  </Menu.Content></Menu.Portal></Menu.Root>
}
