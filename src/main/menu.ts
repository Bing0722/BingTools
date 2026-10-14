import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import type { AppSettings } from '../shared/schemas/settings'
/** 自定义菜单即时切换语言，系统角色保留原生快捷键与行为。 */
export function updateMenu(settings: AppSettings): void {
  const chinese = (settings.language === 'system' ? app.getLocale() : settings.language).toLowerCase().startsWith('zh')
  const label = (zh: string, en: string) => chinese ? zh : en
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: label('编辑', 'Edit'), submenu: [
      { role: 'undo', label: label('撤销', 'Undo') }, { role: 'redo', label: label('重做', 'Redo') }, { type: 'separator' },
      { role: 'cut', label: label('剪切', 'Cut') }, { role: 'copy', label: label('复制', 'Copy') },
      { role: 'paste', label: label('粘贴', 'Paste') }, { role: 'selectAll', label: label('全选', 'Select all') },
    ] },
    { label: label('视图', 'View'), submenu: [
      { role: 'reload', label: label('重新加载', 'Reload') }, { role: 'toggleDevTools', label: label('开发者工具', 'Developer tools') }, { type: 'separator' },
      { role: 'resetZoom', label: label('实际大小', 'Actual size') }, { role: 'zoomIn', label: label('放大', 'Zoom in') },
      { role: 'zoomOut', label: label('缩小', 'Zoom out') }, { role: 'togglefullscreen', label: label('全屏', 'Full screen') },
    ] },
    { label: label('窗口', 'Window'), submenu: [{ role: 'minimize', label: label('最小化', 'Minimize') }, { role: 'close', label: label('关闭', 'Close') }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
