import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { isTrustedUrl } from './trusted-source'
/** 每个业务通道都检查窗口、主 frame 与文档来源，不信任渲染进程传来的身份。 */
export function createGuard(getWindow: () => BrowserWindow | null, expectedUrl: string) {
  return (event: IpcMainInvokeEvent): boolean => {
    const window = getWindow()
    return !!window && !window.isDestroyed() && event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && isTrustedUrl(event.senderFrame.url, expectedUrl)
  }
}
